import { validate as validateEmail } from 'email-validator';
import chalk from 'chalk';
import hp from '../util/humanize-path';
import getArgs from '../util/get-args';
import handleError from '../util/handle-error';
import logo from '../util/output/logo';
import prompt from '../util/login/prompt';
import doSsoLogin from '../util/login/sso';
import doEmailLogin from '../util/login/email';
import { prependEmoji, emoji } from '../util/emoji';
import { getCommandName, getPkgName } from '../util/pkg-name';
import getGlobalPathConfig from '../util/config/global-path';
import { writeToAuthConfigFile, writeToConfigFile } from '../util/config/files';
import Client from '../util/client';
import { LoginResult } from '../util/login/types';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} login`)} <email or team>

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Log into the Vercel platform

    ${chalk.cyan(`$ ${getPkgName()} login`)}

  ${chalk.gray('–')} Log in using a specific email address

    ${chalk.cyan(`$ ${getPkgName()} login john@doe.com`)}

  ${chalk.gray('–')} Log in using a specific team "slug" for SAML Single Sign-On

    ${chalk.cyan(`$ ${getPkgName()} login acme`)}
`);
};

export default async function login(client: Client): Promise<number> {
  let argv;
  const { output } = client;

  try {
    argv = getArgs(client.argv.slice(2));
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  if (argv['--token']) {
    output.error('`--token` may not be used with the "login" command');
    return 2;
  }

  const input = argv._[1];

  let result: LoginResult = 1;

  if (input) {
    // Email or Team slug was provided via command line
    if (validateEmail(input)) {
      result = await doEmailLogin(client, input);
    } else {
      result = await doSsoLogin(client, input);
    }
  } else {
    // Interactive mode
    result = await prompt(client);
  }

  // The login function failed, so it returned an exit code
  if (typeof result === 'number') {
    return result;
  }

  // If the token was upgraded (not a new login), then don't modify
  // the current scope.
  if (!client.authConfig.token) {
    if (result.teamId) {
      // SSO login, so set the current scope to the appropriate Team
      client.config.currentTeam = result.teamId;
    } else {
      delete client.config.currentTeam;
    }
  }

  // When `result` is a string it's the user's authentication token.
  // It needs to be saved to the configuration file.
  client.authConfig.token = result.token;

  writeToAuthConfigFile(client.authConfig);
  writeToConfigFile(client.config);

  output.debug(`Saved credentials in "${hp(getGlobalPathConfig())}"`);

  console.log(
    `${chalk.cyan('Congratulations!')} ` +
      `You are now logged in. In order to deploy something, run ${getCommandName()}.`
  );

  output.print(
    `${prependEmoji(
      `Connect your Git Repositories to deploy every branch push automatically (https://vercel.link/git).`,
      emoji('tip')
    )}\n`
  );

  return 0;
}
