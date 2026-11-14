import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TransportBillingService } from './transport-billing.service';
import { TransportInvoiceDto } from './dto/transport.dto';

@ApiTags('sales')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('sales/transport')
export class TransportBillingController {
  constructor(private billing: TransportBillingService) {}

  // Trajets de camions validés par les opérations et pas encore facturés
  @Get('unbilled')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPTABLE, RoleName.RESPONSABLE_OPERATIONS, RoleName.RESPONSABLE_COMMERCIAL, RoleName.ADMIN_LOGISTIQUE, RoleName.LECTEUR)
  unbilled(@CurrentUser() actor: any, @Query('siteId') siteId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.billing.unbilled(actor, { siteId, from, to });
  }

  @Post('invoice')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPTABLE)
  invoice(@Body() dto: TransportInvoiceDto, @CurrentUser() actor: any) {
    return this.billing.invoice(actor, dto);
  }
}
