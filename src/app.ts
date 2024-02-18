import http from 'http';
import { createNodeMiddleware } from '@octokit/webhooks';
import {
	getGitHubApp,
	getRunnerToken,
	jobShouldUseOrchardCluster,
	configureOrchard,
	runVM,
	forwardWebHookIfNeeded,
	deleteVMIfNeeded,
} from './utility';
import { getConfig } from './config';
import { configureLogging, getLogger } from './logging';
import { getCLIConfig, printUsage } from './cli';

const { verbose, help } = getCLIConfig();
if (help) {
	printUsage();
	process.exit(0);
}

configureLogging(verbose);
const log = getLogger('[app]');

const disposeOrchardConfiguration = await configureOrchard();

const app = getGitHubApp();
const { data } = await app.octokit.request('/app');
log.info(`Authenticated as '${data.name}'`);

app.webhooks.on('workflow_job.queued', async ({ payload }) => {
	const { id, labels } = payload.workflow_job;
	const { html_url: ghUrl } = payload.repository;
	log.info(`Workflow job queued: ${id} | labels: ${labels.join(', ')}`);
	if (jobShouldUseOrchardCluster(labels)) {
		log.info(`Job ${id} should use Orchard cluster`);
		const [owner, repo] = payload.repository.full_name.split('/');
		const installationId = payload.installation?.id;
		if (installationId === undefined) {
			log.error(`No installation ID found for ${id}`);
		} else {
			log.info(`Fetching octokit for job: ${id} | installation: ${installationId}`);
			const octokit = await app.getInstallationOctokit(installationId);
			log.info(`Fetching registration token for ${id}`);
			const token = await getRunnerToken(octokit, owner, repo);
			if (token === undefined) {
				log.error(`Unable to get registration token for ${id}`);
			} else {
				log.info(`Dispatching VM for ${id}`);
				runVM(id, labels, token, ghUrl);
			}
		}
	}
});

app.webhooks.on('workflow_job.completed', async ({ payload }) => {
	const { id, conclusion } = payload.workflow_job;
	log.info('Workflow job completed: %s | %s', id, conclusion);
	if (conclusion === 'cancelled') {
		await deleteVMIfNeeded(id);
	}
});

app.webhooks.onError((error) => {
	if (error.name === 'AggregateError') {
		log.error(`Error processing request: ${error.event}`);
	} else {
		log.error(error);
	}
});

const { webhookUrl } = getConfig().github;
const middleware = createNodeMiddleware(app.webhooks, { path: webhookUrl.pathname });

const server = http.createServer(middleware);
server.listen(webhookUrl.port, () => {
	log.info(`Server is listening for events at: ${webhookUrl}`);
	log.info('Press Ctrl + C to quit.');
});

const disposeWebHookForwardingIfNeeded = forwardWebHookIfNeeded(webhookUrl.href);

// TODO: make an explicit close hook and call from fatal.
process.on('SIGINT', async () => {
	disposeWebHookForwardingIfNeeded();
	log.info('Stopping server...');
	server.close();
	log.info('Server stopped.');
	await disposeOrchardConfiguration();
	log.info('Goodbye! 👋');
});
