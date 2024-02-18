import { Octokit, App } from 'octokit';
import { getConfig } from '../config';
import { getLogger } from '../logging';

export function getGitHubApp() {
	const { appId, privateKey, secret, enterpriseHostname } = getConfig().github;
	const app = new App({
		appId,
		privateKey,
		log: getLogger('[octokit]'),
		webhooks: {
			secret,
		},
		...(enterpriseHostname && {
			Octokit: Octokit.defaults({
				baseUrl: `https://${enterpriseHostname}/api/v3`,
			}),
		}),
	});

	return app;
}

export async function getRunnerToken(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<string> {
	const response = await octokit.request(
		'POST /repos/{owner}/{repo}/actions/runners/registration-token',
		{
			owner,
			repo,
		}
	);
	return response?.data?.token;
}
