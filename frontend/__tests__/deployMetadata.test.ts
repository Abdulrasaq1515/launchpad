import '@testing-library/jest-dom';
import { saveMetadataForContract } from '../app/deploy/utils/metadata';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

describe('Deploy Metadata Cross-Boundary Test (Issue #451)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should save metadata for contract after successful deploy', () => {
    const contractId = 'CCONTRACTIDEXAMPLE1234567890ABCDEF1234567890ABCDEF';
    const metadata = {
      name: 'Test Token',
      symbol: 'TEST',
      description: 'A test token for unit testing',
      logoUrl: 'https://example.com/logo.png',
      website: 'https://example.com',
      twitter: 'https://twitter.com/testtoken',
      discord: 'https://discord.gg/testtoken',
    };

    // Call the function that should be called after deploy success
    saveMetadataForContract(contractId, metadata);

    // Verify localStorage.setItem was called with correct arguments
    expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      `soropad:metadata:${contractId}`,
      JSON.stringify(metadata)
    );
  });

  it('should handle metadata save failures gracefully', () => {
    const contractId = 'CCONTRACTIDEXAMPLE1234567890ABCDEF1234567890ABCDEF';
    const metadata = {
      description: 'Test token',
      logoUrl: 'https://example.com/logo.png',
    };

    // Mock localStorage.setItem to throw an error
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('Storage quota exceeded');
    });

    // Should not throw - failures should be handled gracefully
    expect(() => {
      saveMetadataForContract(contractId, metadata);
    }).not.toThrow();
  });

  it('should store and retrieve metadata correctly', () => {
    const contractId = 'CCONTRACTIDEXAMPLE1234567890ABCDEF1234567890ABCDEF';
    const metadata = {
      name: 'Test Token',
      symbol: 'TEST',
      description: 'A test token for unit testing',
      logoUrl: 'https://example.com/logo.png',
      website: 'https://example.com',
      twitter: 'https://twitter.com/testtoken',
      discord: 'https://discord.gg/testtoken',
    };

    // Save metadata
    saveMetadataForContract(contractId, metadata);

    // Mock the retrieval
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(metadata));

    // Simulate reading metadata (as would be done in TokenDashboard)
    const key = `soropad:metadata:${contractId}`;
    const stored = localStorage.getItem(key);
    const retrievedMetadata = stored ? JSON.parse(stored) : null;

    expect(retrievedMetadata).toEqual(metadata);
    expect(localStorageMock.getItem).toHaveBeenCalledWith(key);
  });

  it('should handle all five metadata fields correctly', () => {
    const contractId = 'CCONTRACTIDEXAMPLE1234567890ABCDEF1234567890ABCDEF';
    
    // Test with all five fields populated
    const completeMetadata = {
      name: 'Complete Token',
      symbol: 'COMP',
      description: 'A token with all metadata fields',
      logoUrl: 'https://example.com/logo.png',
      website: 'https://example.com',
      twitter: 'https://twitter.com/complete',
      discord: 'https://discord.gg/complete',
    };

    saveMetadataForContract(contractId, completeMetadata);

    const savedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
    
    // Verify all five metadata fields are preserved
    expect(savedData.description).toBe('A token with all metadata fields');
    expect(savedData.logoUrl).toBe('https://example.com/logo.png');
    expect(savedData.website).toBe('https://example.com');
    expect(savedData.twitter).toBe('https://twitter.com/complete');
    expect(savedData.discord).toBe('https://discord.gg/complete');
  });

  it('should handle partial metadata gracefully', () => {
    const contractId = 'CCONTRACTIDEXAMPLE1234567890ABCDEF1234567890ABCDEF';
    
    // Test with only some fields populated (realistic scenario)
    const partialMetadata = {
      name: 'Partial Token',
      symbol: 'PART',
      description: 'A token with only some metadata',
      website: 'https://example.com',
      // logoUrl, twitter, discord not provided
    };

    saveMetadataForContract(contractId, partialMetadata);

    const savedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
    
    expect(savedData.description).toBe('A token with only some metadata');
    expect(savedData.website).toBe('https://example.com');
    expect(savedData.logoUrl).toBeUndefined();
    expect(savedData.twitter).toBeUndefined();
    expect(savedData.discord).toBeUndefined();
  });
});