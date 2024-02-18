import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';

interface CLIConfig {
	verbose: boolean;
	help: boolean;
	envFilePath?: string;
	disableAutoTrust: boolean;
	runOrchardController: boolean;
	runOrchardWorker: boolean;
}

export function getCLIConfig(): CLIConfig {
	try {
		const options = commandLineArgs([
			{ name: 'verbose', alias: 'v', type: Boolean },
			{ name: 'help', alias: 'h', type: Boolean },
			{ name: 'env', alias: 'e', type: String },
			{ name: 'run-orchard-controller', type: Boolean },
			{ name: 'run-orchard-worker', type: Boolean },
			{ name: 'disable-auto-trust', type: Boolean },
		]);
		const { verbose, help, env } = options;
		return {
			verbose,
			help,
			envFilePath: env,
			disableAutoTrust: options['disable-auto-trust'] ?? false,
			runOrchardController: options['run-orchard-controller'] ?? false,
			runOrchardWorker: options['run-orchard-worker'] ?? false,
		};
	} catch (e) {
		console.error('Invalid CLI options. See usage below:');
		printUsage();
		process.exit(1);
	}
}

export function printUsage() {
	const sections = [
		{
			header: 'harvest',
			content: format(
				`A GitHub App that implements auto-scaling macOS runners using an underlying Orchard deployment.
				The GitHub App parameters must be configured using environment variables.
				You can optionally have Harvest manage all or parts of the Orchard deployment.
				`
			),
		},
		{
			header: 'Common Options',
			optionList: [
				{
					name: 'env',
					alias: 'e',
					typeLabel: '{underline file}',
					description: 'Path to a .env file to load environment variables from.',
				},
				{
					name: 'verbose',
					alias: 'v',
					type: Boolean,
					description: 'Enables trace level logging.',
				},
				{
					name: 'help',
					description: 'Print this usage guide.',
				},
			],
		},
		{
			header: 'Integrating with Orchard',
			optionList: [
				{
					name: 'run-orchard-controller',
					type: Boolean,
					description: format(`
						Run the Orchard controller as part of Harvest.
						By default, Harvest will not run the controller and will expect a valid orchard context.
						A valid orchard context is checked by running 'orchard list vms' and getting a successful exit code.
						See the list of Orchard environment variables for more information on configuring Orchard orchestration by Harvest.
					`),
				},
				{
					name: 'run-orchard-worker',
					type: Boolean,
					description: format(`
						Run an Orchard worker as part of Harvest.
						By default, Harvest will not run any workers.
					`),
				},
			],
		},
		{
			header: 'Additional Options',
			optionList: [
				{
					name: 'disable-auto-trust',
					type: Boolean,
					description: format(`
						The certificate used by the Orchard controller might be self-signed and not trusted by the system.
						For example, see notes on ORCHARD_CERT_PATH.
						By default, Harvest will trust the certificate used by Orchard {italic if} Harvest is also managing the Orchard controller.
						If you are providing a certificate that is signed by a trusted CA or already trusted in your environment, you can disable this behavior.
						The default enables Harvest to orchestrate Orchard when no certificate is provided and Orchard defaults to creating a self-signed certificate.
					`),
				},
			],
		},
		{
			header: 'Required Environment Variables',
			content: [
				{
					variable: 'GITHUB_APP_ID',
					desc: 'The ID of the GitHub App.',
				},
				{
					variable: 'GITHUB_PRIVATE_KEY_PATH',
					desc: 'The path to the private key file for the GitHub App.',
				},
				{
					variable: 'GITHUB_WEBHOOK_SECRET',
					desc: 'The secret used to sign webhook payloads.',
				},
			],
		},
		{
			header: 'Optional GitHub Environment Variables',
			content: [
				{
					variable: 'ENV_FILE_PATH',
					desc: 'The path to a .env file to load environment variables from. Will fallback to a relative .env.',
				},
				{
					variable: 'GITHUB_WEBHOOK_URL_PREFIX',
					desc: 'The URL prefix for the webhook endpoint. Defaults to http://localhost.',
				},
				{
					variable: 'GITHUB_WEBHOOK_PORT',
					desc: 'The port for the webhook endpoint. Defaults to 3000.',
				},
				{
					variable: 'GITHUB_ENTERPRISE_HOSTNAME',
					desc: 'The hostname of the GitHub Enterprise instance. Defaults to undefined.',
				},
				{
					variable: 'SMEE_URL',
					desc: 'The URL for the Smee.io proxy. If defined, Harvest will use Smee.io to proxy events.',
				},
			],
		},
		{
			header: 'Optional Orchard Environment Variables',
			content: [
				{
					variable: 'ORCHARD_BOOTSTRAP_ADMIN_TOKEN',
					desc: format(`
						The token used for the bootstrap-admin Orchard service account.
						If not defined and if Harvest is running both controller and workers, Harvest will generate one.
						Omitting this setting only makes sense if Harvest is running both the Orchard controller and all workers,
						so if this setting is not defined and this is not the case, Harvest will log an error and exit.
					`),
				},
				{
					variable: 'ORCHARD_CERT_PATH',
					desc: format(`
						The path to the certificate file used by the Orchard controller.
						If not defined and Harvest is running the controller, Orchard will generate a self-signed certificate.
						If defined, ORCHARD_CERT_KEY_PATH must also be defined.
					`),
				},
				{
					variable: 'ORCHARD_CERT_KEY_PATH',
					desc: 'The path to the certificate key file used by the Orchard controller. Must be provided if ORCHARD_CERT_PATH is provided.',
				},
				{
					variable: 'ORCHARD_DATA_DIR',
					desc: 'The directory where Orchard will store data. Defaults to $HOME/.orchard.',
				},
				{
					variable: 'ORCHARD_SUPPORTED_IMAGES',
					desc: format(`
						A comma-separated list of glob patterns indicating supported images.
						Likely, you don't want to auto-pull large images while a job is queued.
						However, you might want the flexibility to use new images without updating the Harvest deployment.
						This configuration parameter allows any desired level of control.
						Defaults to 'ghcr.io/cirruslabs/*'.
					`),
				},
			],
		},
	];
	const usage = commandLineUsage(sections);
	console.log(usage);
}

function format(raw: string) {
	return raw
		.split('\n')
		.map((x) => x.trim())
		.join(' ');
}
