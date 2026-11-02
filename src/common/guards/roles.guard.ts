import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { DEPARTMENTS_KEY } from '../decorators/departments.decorator';
import { Department, departmentAllows } from '../departments';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, targets);
    const allowedDepartments = this.reflector.getAllAndOverride<Department[]>(DEPARTMENTS_KEY, targets);
    const request = context.switchToHttp().getRequest();
    const { user } = request;

    if (requiredRoles && requiredRoles.length > 0) {
      if (!user || !requiredRoles.includes(user.role)) {
        throw new ForbiddenException(
          "Vous n'avez pas la permission d'effectuer cette action.",
        );
      }
    }

    // Cloisonnement par département : uniquement pour les actions qui modifient des données
    if (
      allowedDepartments &&
      allowedDepartments.length > 0 &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    ) {
      if (!departmentAllows(user, allowedDepartments)) {
        throw new ForbiddenException(
          `Action réservée au département : ${allowedDepartments.join(' / ')}.`,
        );
      }
    }
    return true;
  }
}
