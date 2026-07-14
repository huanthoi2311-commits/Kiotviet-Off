import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log/audit-log.service';
import { DomainEventPublisher } from './events/domain-event-publisher.service';

@Global()
@Module({
  providers: [AuditLogService, DomainEventPublisher],
  exports: [AuditLogService, DomainEventPublisher],
})
export class PlatformModule {}
