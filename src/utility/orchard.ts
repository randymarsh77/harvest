import crypto from 'crypto';
import { getConfig } from '../config';
import { getLogger } from '../logging';
import { exec, execAndGetOutput, BackgroundProcess } from './exec';
import { fatal, successOrFatal } from './process';

interface VMState {
	id: number;
	name: string;
}

const jobToVM: { [key: number]: VMState } = {};

export async function runVM(id: number, labels: string[], ghToken: string, ghUrl: string) {
	const log = getLogger();
	const image = mapLabelsToImage(labels);
	const vmName = `${image}-${id}`;
	jobToVM[id] = {
		id,
		name: vmName,
	};

	log.info(`Creating VM ${vmName} from image ${image} for job ${id}`);
	const { exited: vmCreated } = exec('orchard', ['create', 'vm', '--image', image, vmName]);
	await vmCreated;

	try {
		const startRunnerCommand = `./actions-runner/config.sh --url ${ghUrl} --token ${ghToken} --labels ${image} --runnergroup default --name ${vmName} --work _work --ephemeral --disableupdate && ./actions-runner/run.sh`;
		log.info(`Executing runner for job ${id}`);
		const { exited: runnerCompleted } = exec('orchard', ['ssh', 'vm', vmName, startRunnerCommand]);
		await runnerCompleted;

		log.info(`Runner finished for job ${id}`);
	} finally {
		await deleteVMIfNeeded(id);
	}
}

export async function deleteVMIfNeeded(id: number) {
	const vm = jobToVM[id];
	if (vm) {
		delete jobToVM[id];

		const log = getLogger();
		log.info(`Deleting VM ${vm.name} for job ${id}`);
		const { exited: vmDeleted } = exec('orchard', ['delete', 'vm', vm.name]);
		await vmDeleted;
	}
}

export function jobShouldUseOrchardCluster(labels: string[]): boolean {
	const { supportedImages } = getConfig().orchard;
	const targetImages = supportedImages.filter((image) => labels.includes(image));
	return targetImages.length > 0;
}

function mapLabelsToImage(labels: string[]): string {
	const { supportedImages } = getConfig().orchard;
	const targetImages = supportedImages.filter((image) => labels.includes(image));
	if (targetImages.length > 0) {
		if (targetImages.length > 1) {
			const log = getLogger();
			log.warn(
				`Multiple images found: ${targetImages.join(', ')}. Using first one: ${targetImages[0]}`
			);
		}
		return targetImages[0];
	}

	throw new Error('No image found for labels: ' + labels.join(', '));
}

export function runOrchardController(): BackgroundProcess {
	const log = getLogger();
	const { adminBootstrapToken, certPath, certKeyPath, dataDir } = getConfig().orchard;
	const certArgs =
		certPath && certKeyPath ? ['--controller-cert', certPath, '--controller-key', certKeyPath] : [];
	const dataArgs = dataDir ? ['--data-dir', dataDir] : [];
	log.info('Running Orchard controller...');
	return exec('orchard', ['controller', 'run', ...dataArgs, ...certArgs], {
		env: {
			ORCHARD_BOOTSTRAP_ADMIN_TOKEN: adminBootstrapToken,
			HOME: dataDir ?? process.env.HOME,
			GIN_MODE: 'release',
		},
		failureIsFatal: true,
	});
}

async function setDefaultOrchardContext({ create }: { create: boolean }) {
	const log = getLogger();
	const name = getContextName();
	const { contextExists, isDefault } = await getContextState(name);
	if (!contextExists && create) {
		const { adminBootstrapToken, autoTrustCert, url } = getConfig().orchard;
		log.info(`Creating Orchard context with name ${name} ...`);
		const { exited: contextCreated } = exec(
			'orchard',
			[
				'context',
				'create',
				'--name',
				name,
				'--service-account-name',
				'bootstrap-admin',
				'--service-account-token',
				adminBootstrapToken,
				url,
			],
			{ stdin: autoTrustCert ? 'yes\n' : undefined }
		);

		await successOrFatal(contextCreated, `Could not create Orchard context named ${name}`);
	}

	if (!isDefault) {
		log.info('Setting default Orchard context...');
		const { exited: defaultContextSet } = exec('orchard', ['context', 'default', name]);
		await successOrFatal(defaultContextSet, `Could not set default Orchard context named ${name}`);
	}
}

export async function configureOrchard() {
	const log = getLogger();

	const { runController, runWorker, url } = getConfig().orchard;

	log.info('Checking for Orchard...');
	const { exited: success } = exec('orchard', ['--version']);
	await success;

	const disposables = new Array<() => Promise<void>>();

	if (runController) {
		const { kill: stopOrchardController } = runOrchardController();

		// Hope the controller boots in 1 second
		// TODO: Make this more robust
		await wait(1000);

		disposables.push(async () => {
			log.info('Stopping Orchard controller...');
			await stopOrchardController();
			log.info('Orchard controller stopped.');
		});

		await setDefaultOrchardContext({ create: true });

		if (runWorker) {
			log.info('Fetching bootstrap-token...');
			const bootstrapToken = await execAndGetOutput('orchard', [
				'get',
				'bootstrap-token',
				'bootstrap-admin',
			]);

			// TODO: Support masking log output
			// log.mask(bootstrapToken);

			log.info('Starting Orchard worker...');
			const { kill: stopWorker } = exec('orchard', [
				'worker',
				'run',
				url,
				'--bootstrap-token',
				bootstrapToken,
			]);

			disposables.push(async () => {
				log.info('Stopping Orchard worker...');
				await stopWorker();
				log.info('Orchard worker stopped.');
			});
		}
	} else {
		log.info('Validating Orchard context...');
		const context = await execAndGetOutput('orchard', ['context', 'list']);
		const contextExistsAndIsDefault =
			context
				.split('\n')
				.slice(1)
				.filter((x) => x.includes(url))
				.filter((x) => x.includes('*')).length > 0;
		if (!contextExistsAndIsDefault) {
			fatal(`Orchard context for ${url} does not exist or is not selected as the default.`);
		}

		await successOrFatal(
			execAndGetOutput('orchard', ['list', 'vms']),
			'Could not successfully execute an Orchard command. Make sure the default Orchard context is configured correctly.'
		);
	}

	return async () => {
		for (const dispose of disposables) {
			await dispose();
		}
	};
}

function getContextName() {
	const { adminBootstrapToken, url } = getConfig().orchard;
	const input = `${adminBootstrapToken}|${url}`;
	const hash = crypto.createHash('md5').update(input).digest('hex');
	return hash;
}

async function getContextState(name: string) {
	return (
		(await execAndGetOutput('orchard', ['context', 'list']))
			.split('\n')
			.map((x) => ({ contextExists: x.includes(name), isDefault: x.includes('*') }))
			.find((x) => x.contextExists) ?? { contextExists: false, isDefault: false }
	);
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
