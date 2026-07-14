import { Injectable } from '@nestjs/common';
import geoip from 'geoip-lite';
import { UAParser } from 'ua-parser-js';
import {
  IDeviceInfoResolver,
  ResolvedDeviceInfo,
} from '../../domain/services/device-info-resolver.interface';

@Injectable()
export class DeviceInfoResolver implements IDeviceInfoResolver {
  resolve(userAgent: string | null, ip: string | null): ResolvedDeviceInfo {
    let browser: string | null = null;
    let os: string | null = null;

    if (userAgent) {
      const parsed = new UAParser(userAgent).getResult();
      browser =
        [parsed.browser.name, parsed.browser.version]
          .filter(Boolean)
          .join(' ') || null;
      os =
        [parsed.os.name, parsed.os.version].filter(Boolean).join(' ') || null;
    }

    let country: string | null = null;
    let city: string | null = null;

    // geoip-lite không phân giải được IP loopback/private (127.0.0.1, ::1, 192.168.x.x) —
    // bình thường khi chạy local/dev, chỉ có ý nghĩa với IP public thật ở production.
    if (ip) {
      const geo = geoip.lookup(ip);
      if (geo) {
        country = geo.country ?? null;
        city = geo.city ?? null;
      }
    }

    return { browser, os, country, city };
  }
}
