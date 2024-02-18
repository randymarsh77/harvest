import fs from 'fs';
import dotenv from 'dotenv';
import { getCLIConfig } from './cli';
import { getLogger } from './logging';

interface GitHubAppConfig {
	appId: string;
	privateKey: string;
	secret: string;
	webhookUrl: URL;
	enterpriseHostname?: string;
}

interface SmeeConfig {
	url?: string;
}

interface OrchardConfig {
	adminBootstrapToken: string;
	supportedImages: string[];
	autoTrustCert: boolean;
	runController: boolean;
	runWorker: boolean;
	url: string;
	dataDir?: string;
	certPath?: string;
	certKeyPath?: string;
}

interface AppConfig {
	github: GitHubAppConfig;
	orchard: OrchardConfig;
	smee: SmeeConfig;
}

let cachedConfig: AppConfig | undefined;

export function getConfig(): AppConfig {
	if (cachedConfig) {
		return cachedConfig;
	}

	const log = getLogger();

	const { envFilePath } = getCLIConfig();
	const envPath = process.env.ENV_FILE_PATH ?? envFilePath ?? '.env';
	if (fs.existsSync(envPath)) {
		log.info(`Loading environment variables from ${envPath}`);
		dotenv.config({ path: envPath });
	}

	const github = getGitHubConfig();
	const orchard = getOrchardConfig();

	cachedConfig = {
		github,
		orchard,
		smee: {
			url: process.env.SMEE_URL,
		},
	};

	return cachedConfig;
}

function getGitHubConfig(): GitHubAppConfig {
	const appId = requireEnv('GITHUB_APP_ID');
	const privateKeyPath = requireEnv('GITHUB_PRIVATE_KEY_PATH');
	if (!fs.existsSync(privateKeyPath)) {
		throw new Error(`GITHUB_PRIVATE_KEY_PATH is defined but not found at: ${privateKeyPath}`);
	}

	const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

	const secret = requireEnv('GITHUB_WEBHOOK_SECRET');

	const prefix = process.env.GITHUB_WEBHOOK_URL_PREFIX ?? 'http://localhost';
	const port = process.env.GITHUB_WEBHOOK_PORT || 3000;
	const enterpriseHostname = process.env.GITHUB_ENTERPRISE_HOSTNAME;

	return {
		appId,
		privateKey,
		secret,
		webhookUrl: new URL(`${prefix}:${port}/api/webhook`),
		enterpriseHostname,
	};
}

function getOrchardConfig(): OrchardConfig {
	const supportedImages = requireEnv('ORCHARD_SUPPORTED_IMAGES', 'ghcr.io/cirruslabs/*').split(',');
	if (supportedImages.length === 0) {
		throw new Error('No supported images specified');
	}

	const certPath = process.env.ORCHARD_CERT_PATH;
	const certKeyPath = process.env.ORCHARD_CERT_KEY_PATH;

	if (certPath && !fs.existsSync(certPath)) {
		throw new Error(`Orchard certificate file was specified but not found at: ${certPath}`);
	}

	if (certKeyPath && !fs.existsSync(certKeyPath)) {
		throw new Error(`Orchard certificate key file was specified but not found at: ${certKeyPath}`);
	}

	if (certPath && !certKeyPath) {
		throw new Error(
			'Orchard certificate key path not specified but is required when the certificate path is specified'
		);
	}

	if (certKeyPath && !certPath) {
		throw new Error(
			'Orchard certificate path not specified but is required when the certificate key path is specified'
		);
	}

	const { runOrchardController, runOrchardWorker, disableAutoTrust } = getCLIConfig();

	const defaultBootstrapToken = runOrchardController && runOrchardWorker ? '' : undefined;
	const adminBootstrapToken = requireEnv('ORCHARD_BOOTSTRAP_ADMIN_TOKEN', defaultBootstrapToken);

	if (runOrchardWorker && !runOrchardController) {
		throw new Error('Orchard workers cannot be run without also running the controller');
	}

	const url = requireEnv('ORCHARD_URL', 'https://localhost:6120');

	return {
		adminBootstrapToken,
		autoTrustCert: !disableAutoTrust,
		supportedImages,
		runController: runOrchardController,
		runWorker: runOrchardWorker,
		url,
		certPath,
		certKeyPath,
		dataDir: process.env.ORCHARD_DATA_DIR,
	};
}

function requireEnv(variable: string, defaultValue?: string): string {
	const value = process.env[variable] ?? defaultValue;
	if (!value) {
		throw new Error(`Required environment variable is not defined: ${variable}`);
	}

	return value;
}
