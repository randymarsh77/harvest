import { spawn, ProcessEnvOptions } from 'child_process';
import { getLogger } from '../logging';
import { fatal } from './process';

export function execAndGetOutput(
	command: string,
	args?: readonly string[],
	options?: ProcessEnvOptions & { stdin?: string; logPrefix?: string }
): Promise<string> {
	const execLog = getLogger('[exec]');
	const commandLogString = `${command} ${args?.join(' ')}`;
	execLog.debug(`Spawning: ${commandLogString}`);
	const log = getLogger(options?.logPrefix ?? `[${command}]`);
	return new Promise((resolve, reject) => {
		const process = spawn(command, args, options);
		let output = '';
		process.stdout.on('data', (x) => {
			output += x.toString();
		});
		process.stderr.on('data', (x) => log.error(x.toString()));
		process.on('exit', function (code) {
			execLog.debug(`Exited: ${code} | ${commandLogString}`);
			if (code === 0) {
				resolve(output);
			} else {
				reject();
			}
		});
	});
}

export interface BackgroundProcess {
	exited: Promise<void>;
	kill: () => Promise<void>;
}

export function exec(
	command: string,
	args?: readonly string[],
	options?: ProcessEnvOptions & { stdin?: string; logPrefix?: string; failureIsFatal?: boolean }
): BackgroundProcess {
	const execLog = getLogger('[exec]');
	const commandLogString = `${command} ${args?.join(' ')}`;
	execLog.debug(`Spawning: ${commandLogString}`);
	const process = spawn(command, args, options);
	if (options?.stdin) {
		process.stdin.write(options.stdin);
	}
	let killingProcess = false;
	const log = getLogger(options?.logPrefix ?? `[${command}]`);
	const exited = new Promise<void>((resolve, reject) => {
		process.stdout.on('data', (x) => log.info(x.toString()));
		process.stderr.on('data', (x) => log.error(x.toString()));
		process.on('exit', function (code) {
			execLog.debug(`Exited: ${code} | ${commandLogString}`);
			if (code === 0 || killingProcess) {
				resolve();
			} else {
				if (options?.failureIsFatal) {
					fatal('Failure in critical process: ' + commandLogString);
				}
				reject();
			}
		});
	});
	const kill = async () => {
		execLog.debug(`Killing: ${commandLogString}`);
		killingProcess = true;
		process.kill('SIGINT');
		try {
			await exited;
		} catch (e) {}
	};
	return { exited, kill };
}
