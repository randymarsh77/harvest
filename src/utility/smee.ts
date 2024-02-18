import SmeeClient from 'smee-client';
import { getConfig } from '../config';
import { getLogger } from '../logging';

export function forwardWebHookIfNeeded(webhookUrl: string) {
	const { url } = getConfig().smee;
	if (url === undefined) {
		return () => {};
	}

	const log = getLogger();
	log.info('Forwarding webhooks from: %s to: %s', url, webhookUrl);

	const smee = new SmeeClient({
		source: url,
		target: webhookUrl,
		logger: getLogger('[smee]'),
	});

	const events = smee.start();

	return () => {
		log.info('Stopping webhook forwarding...');
		events.close();
		log.info('Webhook forwarding stopped.');
	};
}
