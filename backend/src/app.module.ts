import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { BranchModule } from './modules/branch/branch.module';
import { CartModule } from './modules/cart/cart.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { CustomerModule } from './modules/customer/customer.module';
import { CustomerPointModule } from './modules/customer-point/customer-point.module';
import { DiscountModule } from './modules/discount/discount.module';
import { InvoiceModule } from './modules/invoice/invoice.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PaymentModule } from './modules/payment/payment.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { JwtConfigModule } from './config/jwt-config.module';
import { AuthModule } from './modules/auth/auth.module';
import { BarcodeModule } from './modules/barcode/barcode.module';
import { BrandModule } from './modules/brand/brand.module';
import { CategoryModule } from './modules/category/category.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { InventoryAdjustmentModule } from './modules/inventory-adjustment/inventory-adjustment.module';
import { PurchaseOrderModule } from './modules/purchase-order/purchase-order.module';
import { PurchaseReportModule } from './modules/purchase-report/purchase-report.module';
import { PurchaseReturnModule } from './modules/purchase-return/purchase-return.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { SupplierDebtModule } from './modules/supplier-debt/supplier-debt.module';
import { StockCountModule } from './modules/stock-count/stock-count.module';
import { SupplierModule } from './modules/supplier/supplier.module';
import { TransferModule } from './modules/transfer/transfer.module';
import { PlatformModule } from './modules/platform/platform.module';
import { ProductModule } from './modules/product/product.module';
import { UnitModule } from './modules/unit/unit.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';
import { WebsocketModule } from './websocket/websocket.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    // Rate limit mặc định: 100 request / phút / IP. Endpoint nhạy cảm (login, refresh,
    // forgot-password) tự siết chặt hơn qua @Throttle() ngay tại route (xem AuthController).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    // Domain Event bus trong-tiến-trình (Prompt 031) — module publish qua DomainEventPublisher
    // (platform/events), subscriber lắng nghe bằng @OnEvent(...), không gọi thẳng service module khác.
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    QueueModule,
    JwtConfigModule,
    WebsocketModule,
    PlatformModule,
    RbacModule,
    AuthModule,
    OrganizationModule,
    BranchModule,
    ProductModule,
    CategoryModule,
    BrandModule,
    UnitModule,
    BarcodeModule,
    WarehouseModule,
    InventoryModule,
    TransferModule,
    StockCountModule,
    InventoryAdjustmentModule,
    SupplierModule,
    PurchaseOrderModule,
    PurchaseReturnModule,
    SupplierDebtModule,
    PurchaseReportModule,
    CustomerModule,
    CustomerPointModule,
    CartModule,
    DiscountModule,
    PaymentModule,
    InvoiceModule,
    CheckoutModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
