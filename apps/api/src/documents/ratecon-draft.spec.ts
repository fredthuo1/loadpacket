import { RateConDraftService } from './ratecon-draft.service';
import { RateConTextExtractorService } from './ratecon-text-extractor.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import fixture from '../../test/fixtures/ratecon-brf-94726.json';
jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));
jest.mock('pdf-parse/worker', () => ({ CanvasFactory: class {} }));

describe('RateCon draft structural parsing', () => {
  const parse = (text: string) => {
    const extractor = {
      extractPdfText: jest
        .fn()
        .mockResolvedValue({ documentId: 'fixture', pageCount: 2, text }),
    };
    return new RateConDraftService(
      extractor as unknown as RateConTextExtractorService,
    ).createDraft({} as AuthenticatedUser, 'fixture');
  };
  it('extracts the supplied two-page PDF text without mixing column fields', async () => {
    const result = await parse(fixture.text);
    expect(result).toMatchObject({
      loadNumber: 'BRF-94726',
      brokerName: 'BlueRiver Freight Brokerage LLC',
      brokerContact: 'Melissa Grant',
      equipment: '53 ft Dry Van',
      currency: 'USD',
      linehaul: '3250.00',
      fuelSurcharge: '200.00',
      totalRate: '3450.00',
      pickup: {
        facilityName: 'Midwest Food Products Distribution Center',
        address: '2400 Enterprise Ave, St. Louis, MO 63147',
        appointment: '8:00 AM CDT',
        date: 'September 28, 2026',
        referenceNumber: 'PU-882451',
      },
      delivery: {
        facilityName: 'Lone Star Retail Distribution Center',
        address: '8800 Logistics Pkwy, Dallas, TX 75241',
        appointment: '2:00 PM CDT',
        date: 'September 29, 2026',
        referenceNumber: 'DEL-663921',
      },
    });
    for (const type of ['BOL', 'POD', 'CARRIER_INVOICE'])
      expect(result.requirements).toContainEqual({
        type,
        documentType: type,
        requirement: 'REQUIRED',
        confidence: 0.98,
      });
    expect(result.warnings).toEqual([]);
  });
  it('retains legacy labeled stops and a single-line postal address', async () => {
    const result = await parse(
      `Load Number: OLD-123\nBroker: Fixture Brokerage\nEquipment: Reefer\nLinehaul: 100.00\nFuel: 20.00\nPickup\nFacility: Old Origin\nAddress: 100 Main St, Austin, TX 78701\nAppointment: Monday 9 AM\nPickup Number: PU-OLD\nDelivery\nFacility Name: Old Destination\nAddress: 200 Main St, Denver, CO 80202\nAppointment: Tuesday 1 PM\nDelivery Number: DEL-OLD`,
    );
    expect(result).toMatchObject({
      loadNumber: 'OLD-123',
      equipment: 'Reefer',
      totalRate: '120.00',
      pickup: {
        facilityName: 'Old Origin',
        address: '100 Main St, Austin, TX 78701',
        appointment: 'Monday 9 AM',
      },
      delivery: {
        facilityName: 'Old Destination',
        address: '200 Main St, Denver, CO 80202',
        appointment: 'Tuesday 1 PM',
      },
    });
  });
  it('recognizes numbered single-column headings and does not fabricate a missing delivery', async () => {
    const result = await parse(
      'PICKUP - STOP 3\nOther Warehouse\n120 Oak Rd\nTulsa, OK 74103\nAppointment: 6 AM\nPickup Number: OTHER-1',
    );
    expect(result.pickup).toMatchObject({
      facilityName: 'Other Warehouse',
      address: '120 Oak Rd, Tulsa, OK 74103',
      appointment: '6 AM',
    });
    expect(result.delivery).toMatchObject({
      facilityName: null,
      address: '',
      appointment: null,
    });
  });
  it('requires review when a combined layout has no reliable reference boundary', async () => {
    const result = await parse(
      fixture.text.replace(
        'Delivery Number: DEL-663921',
        'Reference unavailable',
      ),
    );
    expect(result.delivery.appointment).toBeNull();
    expect(result.warnings).toContain('Delivery address needs review.');
  });
  it('never crosses a pickup reference when delivery has a reference but no address', async () => {
    const result = await parse(
      fixture.text.replace(
        '8800 Logistics Pkwy\nDallas, TX 75241',
        'Address unavailable',
      ),
    );
    expect(result.delivery).toMatchObject({
      facilityName: null,
      address: '',
      appointment: null,
    });
    expect(result.pickup.address).toBe(
      '2400 Enterprise Ave, St. Louis, MO 63147',
    );
  });
});
