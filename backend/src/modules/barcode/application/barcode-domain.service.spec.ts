import { BarcodeDomainService } from './barcode-domain.service';
import { IBarcodeRepository } from '../domain/repositories/barcode.repository.interface';

describe('BarcodeDomainService', () => {
  let service: BarcodeDomainService;
  let barcodeRepository: jest.Mocked<
    Pick<IBarcodeRepository, 'hasActiveBarcodesInUnit'>
  >;

  beforeEach(() => {
    barcodeRepository = {
      hasActiveBarcodesInUnit: jest.fn(),
    };
    service = new BarcodeDomainService(
      barcodeRepository as unknown as IBarcodeRepository,
    );
  });

  it('hasActiveBarcodesInUnit ủy quyền thẳng cho Repository', async () => {
    barcodeRepository.hasActiveBarcodesInUnit.mockResolvedValue(true);
    const result = await service.hasActiveBarcodesInUnit('unit-1');
    expect(result).toBe(true);
    expect(barcodeRepository.hasActiveBarcodesInUnit).toHaveBeenCalledWith(
      'unit-1',
    );
  });
});
