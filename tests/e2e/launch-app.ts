import { type ElectronApplication, _electron as electron } from '@playwright/test'

/**
 * Starts Ahral with its data in `userDataDir`.
 *
 * By default this runs the built app in out/ with the project's Electron. When
 * AHRAL_EXECUTABLE is set (npm run test:packaged), it runs the packaged Ahral.exe
 * instead, so the same tests check the app exactly as users install it.
 */
export function launchApp(userDataDir: string): Promise<ElectronApplication> {
  // Drop ELECTRON_RUN_AS_NODE if it leaked in from the shell: it would start Electron as plain Node.
  const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env
  const executablePath = process.env.AHRAL_EXECUTABLE
  return electron.launch({
    ...(executablePath ? { executablePath, args: [] } : { args: ['.'] }),
    env: { ...(env as Record<string, string>), AHRAL_USER_DATA: userDataDir }
  })
}
