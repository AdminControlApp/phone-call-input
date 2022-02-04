import process from 'node:process';
import pWaitFor from 'p-wait-for';
import { runAppleScript } from 'run-applescript';
import inquirer from 'inquirer';
import { getSecureInputApps } from '~/utils/secure-input.js';
import { getCallSpinner } from '~/utils/spinner.js';

export async function inputPasscodeKeystrokes(passcode: string) {
	const callSpinner = getCallSpinner();
	callSpinner.stop();

	await pWaitFor(
		() => {
			console.info('🔒 Waiting for focus on a secure input textbox...');
			return getSecureInputApps().length > 0;
		},
		{ interval: 1000 }
	);

	await runAppleScript(
		`tell application "System Events" to keystroke "${passcode}"`
	);

	const { reinput } = await inquirer.prompt<{ reinput: boolean }>([
		{
			name: 'reinput',
			type: 'confirm',
		},
	]);

	if (reinput) {
		await inputPasscodeKeystrokes(passcode);
	} else {
		process.exit(0);
	}
}
