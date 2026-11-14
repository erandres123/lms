import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './auth.decorators';
import type { AuthUser } from './auth.types';

@Controller('me')
export class MeController {
  @Get()
  getMe(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
