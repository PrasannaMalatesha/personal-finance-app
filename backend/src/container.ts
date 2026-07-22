import type { Pool } from 'pg';
import type { Logger } from 'pino';
import { createUsersRepo } from './repositories/users.repo';
import { createRefreshTokensRepo } from './repositories/refreshTokens.repo';
import { createAuthService } from './services/auth.service';
import { createAuthController, type AuthController } from './controllers/auth.controller';
import { createAuthMiddleware } from './middleware/auth';
import { createTokenSigner } from './lib/tokens';
import { bcryptHasher } from './lib/password';
import { systemClock } from './lib/clock';

export interface Container {
  authController: AuthController;
  authMiddleware: ReturnType<typeof createAuthMiddleware>;
}

export interface ContainerConfig {
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
}

export function buildContainer(
  pool: Pool,
  logger: Logger,
  config: ContainerConfig,
): Container {
  const tokenSigner = createTokenSigner(
    config.jwtAccessSecret,
    config.jwtRefreshSecret,
  );

  const usersRepo = createUsersRepo(pool);
  const refreshTokensRepo = createRefreshTokensRepo(pool);

  const authService = createAuthService({
    pool,
    usersRepo,
    refreshTokensRepo,
    clock: systemClock,
    tokenSigner,
    passwordHasher: bcryptHasher,
    logger,
  });

  const authController = createAuthController(authService);
  const authMiddleware = createAuthMiddleware(tokenSigner);

  return { authController, authMiddleware };
}
