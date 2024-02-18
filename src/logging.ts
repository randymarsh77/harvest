import consoleLogLevel, { LogLevelNames } from 'console-log-level';

let level: LogLevelNames = 'info';

export function configureLogging(verbose: boolean): void {
	level = verbose ? 'trace' : 'info';
}

export function getLogger(prefix?: string) {
	return consoleLogLevel({ level, prefix: prefix ?? '[app]' });
}
