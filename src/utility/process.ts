import { getLogger } from '../logging';

export function fatal(message: string): never {
	const log = getLogger();
	log.fatal('[FATAL] %s', message);
	process.exit(1);
}

export async function successOrFatal<T>(promise: Promise<T>, message: string): Promise<T> {
	try {
		return await promise;
	} catch (e) {
		const log = getLogger();
		log.error(e);
		log.fatal('[FATAL] %s', message);
		process.exit(1);
	}
}
