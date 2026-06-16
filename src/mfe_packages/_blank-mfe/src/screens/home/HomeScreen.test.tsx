// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-blank-mfe-tests:p1
import { act, render, screen, within } from '@testing-library/react';
import {
  HAI3_SHARED_PROPERTY_LANGUAGE,
  HAI3_SHARED_PROPERTY_THEME,
} from '@gears-frontx/react';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getServiceMock,
  useApiQueryMock,
  useScreenTranslationsMock,
} = vi.hoisted(() => ({
  getServiceMock: vi.fn(),
  useApiQueryMock: vi.fn(),
  useScreenTranslationsMock: vi.fn(),
}));

vi.mock('@gears-frontx/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gears-frontx/react')>();
  return {
    ...actual,
    apiRegistry: {
      getService: getServiceMock,
    },
    useApiQuery: useApiQueryMock,
  };
});

vi.mock('../../api/_BlankApiService', () => ({
  _BlankApiService: class MockBlankApiService {
    static {
      void 0;
    }
  },
}));

vi.mock('../../shared/useScreenTranslations', () => ({
  useScreenTranslations: useScreenTranslationsMock,
}));

import { HomeScreen } from './HomeScreen';

// Neutral fixture values — test-controlled, not tied to any template placeholder.
const TEST_THEME = 'smoke-theme';
const TEST_LANGUAGE = 'en';
const TEST_DOMAIN_ID = 'smoke-domain';
const TEST_INSTANCE_ID = 'smoke-instance';

const testStatusData = {
  message: 'test-status-ok',
  generatedAt: '2024-01-01T00:00:00.000Z',
  capabilities: ['cap-a'],
};

describe('HomeScreen', () => {
  beforeEach(() => {
    getServiceMock.mockReturnValue({ getStatus: { type: 'status' } });
    useScreenTranslationsMock.mockReturnValue({ t: (key: string) => key, loading: false });
    useApiQueryMock.mockReturnValue({ data: testStatusData, isLoading: false, isError: false, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders bridge-provided values and API status data', async () => {
    const { bridge } = createMfeBridgeFixture({
      domainId: TEST_DOMAIN_ID,
      instanceId: TEST_INSTANCE_ID,
      initialProperties: {
        [HAI3_SHARED_PROPERTY_THEME]: TEST_THEME,
        [HAI3_SHARED_PROPERTY_LANGUAGE]: TEST_LANGUAGE,
      },
    });

    render(<HomeScreen bridge={bridge} />);

    // Bridge domainId, instanceId, theme, and language all flow through to the DOM.
    expect(await screen.findByText(TEST_DOMAIN_ID)).toBeTruthy();
    expect(screen.getByText(TEST_INSTANCE_ID)).toBeTruthy();
    expect(screen.getByText(TEST_THEME)).toBeTruthy();
    expect(screen.getByText(TEST_LANGUAGE)).toBeTruthy();

    // API response content is rendered (JSON-serialized blob contains the message field).
    expect(screen.getByText((content) => content.includes(testStatusData.message))).toBeTruthy();
  });

  it('renders the API error message when the status call fails', async () => {
    useApiQueryMock.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error('status fetch failed'),
    });

    const { bridge } = createMfeBridgeFixture({
      domainId: TEST_DOMAIN_ID,
      instanceId: TEST_INSTANCE_ID,
      initialProperties: {
        [HAI3_SHARED_PROPERTY_THEME]: TEST_THEME,
        [HAI3_SHARED_PROPERTY_LANGUAGE]: TEST_LANGUAGE,
      },
    });

    render(<HomeScreen bridge={bridge} />);

    expect(await screen.findByText('status fetch failed')).toBeTruthy();
  });

  it('renders the translation-loading skeleton before localized content is ready', () => {
    useScreenTranslationsMock.mockReturnValue({ t: (key: string) => key, loading: true });

    const { bridge } = createMfeBridgeFixture({
      domainId: TEST_DOMAIN_ID,
      instanceId: TEST_INSTANCE_ID,
      initialProperties: {
        [HAI3_SHARED_PROPERTY_THEME]: TEST_THEME,
        [HAI3_SHARED_PROPERTY_LANGUAGE]: TEST_LANGUAGE,
      },
    });

    const { container } = render(<HomeScreen bridge={bridge} />);

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(5);
    expect(screen.queryByText(TEST_DOMAIN_ID)).toBeNull();
  });

  it('renders the status-loading skeleton while the API request is pending', async () => {
    useApiQueryMock.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
    });

    const { bridge } = createMfeBridgeFixture({
      domainId: TEST_DOMAIN_ID,
      instanceId: TEST_INSTANCE_ID,
      initialProperties: {
        [HAI3_SHARED_PROPERTY_THEME]: TEST_THEME,
        [HAI3_SHARED_PROPERTY_LANGUAGE]: TEST_LANGUAGE,
      },
    });

    const { container } = render(<HomeScreen bridge={bridge} />);

    expect(await screen.findByText(TEST_DOMAIN_ID)).toBeTruthy();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });

  it('reacts to bridge property updates and unsubscribes on unmount', async () => {
    const bridgeFixture = createMfeBridgeFixture({
      domainId: TEST_DOMAIN_ID,
      instanceId: TEST_INSTANCE_ID,
      initialProperties: {
        [HAI3_SHARED_PROPERTY_THEME]: TEST_THEME,
        [HAI3_SHARED_PROPERTY_LANGUAGE]: TEST_LANGUAGE,
      },
    });
    const host = document.createElement('div');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const mountNode = document.createElement('div');
    shadowRoot.appendChild(mountNode);
    document.body.appendChild(host);
    const shadowQueries = within(mountNode);

    const { unmount } = render(<HomeScreen bridge={bridgeFixture.bridge} />, {
      container: mountNode,
    });

    expect(await shadowQueries.findByText(TEST_THEME)).toBeTruthy();
    expect(shadowQueries.getByText(TEST_LANGUAGE)).toBeTruthy();

    act(() => {
      bridgeFixture.setProperty(HAI3_SHARED_PROPERTY_THEME, 'updated-theme');
      bridgeFixture.setProperty(HAI3_SHARED_PROPERTY_LANGUAGE, 'ar');
    });

    expect(shadowQueries.getByText('updated-theme')).toBeTruthy();
    expect(shadowQueries.getByText('ar')).toBeTruthy();
    expect(host.dir).toBe('rtl');

    act(() => {
      bridgeFixture.setProperty(HAI3_SHARED_PROPERTY_LANGUAGE, 'en');
    });

    expect(shadowQueries.getByText('en')).toBeTruthy();
    expect(host.dir).toBe('ltr');

    unmount();

    expect(bridgeFixture.unsubscriptions).toHaveLength(2);
    for (const { unsubscribe } of bridgeFixture.unsubscriptions) {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    }

    host.remove();
  });
});
