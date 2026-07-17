import { UnitDomainService } from './unit-domain.service';
import { IUnitRepository } from '../domain/repositories/unit.repository.interface';

describe('UnitDomainService', () => {
  let service: UnitDomainService;
  let unitRepository: jest.Mocked<Pick<IUnitRepository, 'findById'>>;

  beforeEach(() => {
    unitRepository = {
      findById: jest.fn(),
    };
    service = new UnitDomainService(
      unitRepository as unknown as IUnitRepository,
    );
  });

  it('findByIdForReference ủy quyền thẳng cho Repository', async () => {
    const unit = { id: 'unit-1', status: 'ACTIVE' };
    unitRepository.findById.mockResolvedValue(unit as never);

    const result = await service.findByIdForReference('org-1', 'unit-1');

    expect(result).toEqual(unit);
    expect(unitRepository.findById).toHaveBeenCalledWith('unit-1', 'org-1');
  });

  it('trả về null khi Unit không tồn tại hoặc khác organization', async () => {
    unitRepository.findById.mockResolvedValue(null);

    const result = await service.findByIdForReference('org-1', 'missing');

    expect(result).toBeNull();
  });
});
