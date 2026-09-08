import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/payment.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  create(@Body() dto: CreatePaymentDto, @CurrentUser() actor: any) {
    return this.paymentsService.create(dto, actor.userId);
  }

  @Get()
  findAll(@Query('salesInvoiceId') salesInvoiceId?: string, @Query('purchaseInvoiceId') purchaseInvoiceId?: string) {
    return this.paymentsService.findAll({ salesInvoiceId, purchaseInvoiceId });
  }
}
