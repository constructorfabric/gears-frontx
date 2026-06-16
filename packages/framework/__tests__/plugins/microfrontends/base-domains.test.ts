/**
 * Base Extension Domain Constants Tests
 *
 * Tests for the 4 base extension domain constants to verify they include
 * theme and language shared properties.
 */

import { describe, it, expect } from 'vitest';
import {
  screenDomain,
  sidebarDomain,
  popupDomain,
  overlayDomain,
} from '../../../src/plugins/microfrontends/base-domains';
import {
  HAI3_SHARED_PROPERTY_THEME,
  HAI3_SHARED_PROPERTY_LANGUAGE,
  HAI3_SCREEN_EXTENSION_TYPE,
  HAI3_ACTION_LOAD_EXT,
  HAI3_ACTION_MOUNT_EXT,
} from '@gears-frontx/screensets';

describe('Base Extension Domain Constants - Shared Properties', () => {
  describe('screenDomain sharedProperties', () => {
    it('contains HAI3_SHARED_PROPERTY_THEME', () => {
      expect(screenDomain.sharedProperties).toContain(HAI3_SHARED_PROPERTY_THEME);
    });

    it('contains HAI3_SHARED_PROPERTY_LANGUAGE', () => {
      expect(screenDomain.sharedProperties).toContain(HAI3_SHARED_PROPERTY_LANGUAGE);
    });
  });

  describe('sidebarDomain sharedProperties', () => {
    it('contains HAI3_SHARED_PROPERTY_THEME', () => {
      expect(sidebarDomain.sharedProperties).toContain(HAI3_SHARED_PROPERTY_THEME);
    });

    it('contains HAI3_SHARED_PROPERTY_LANGUAGE', () => {
      expect(sidebarDomain.sharedProperties).toContain(HAI3_SHARED_PROPERTY_LANGUAGE);
    });
  });

  describe('popupDomain sharedProperties', () => {
    it('contains HAI3_SHARED_PROPERTY_THEME', () => {
      expect(popupDomain.sharedProperties).toContain(HAI3_SHARED_PROPERTY_THEME);
    });

    it('contains HAI3_SHARED_PROPERTY_LANGUAGE', () => {
      expect(popupDomain.sharedProperties).toContain(HAI3_SHARED_PROPERTY_LANGUAGE);
    });
  });

  describe('overlayDomain sharedProperties', () => {
    it('contains HAI3_SHARED_PROPERTY_THEME', () => {
      expect(overlayDomain.sharedProperties).toContain(HAI3_SHARED_PROPERTY_THEME);
    });

    it('contains HAI3_SHARED_PROPERTY_LANGUAGE', () => {
      expect(overlayDomain.sharedProperties).toContain(HAI3_SHARED_PROPERTY_LANGUAGE);
    });
  });

  describe('Verify all domains include shared properties', () => {
    it('all 4 domains have HAI3_SHARED_PROPERTY_THEME', () => {
      expect(screenDomain.sharedProperties).toContain(HAI3_SHARED_PROPERTY_THEME);
      expect(sidebarDomain.sharedProperties).toContain(HAI3_SHARED_PROPERTY_THEME);
      expect(popupDomain.sharedProperties).toContain(HAI3_SHARED_PROPERTY_THEME);
      expect(overlayDomain.sharedProperties).toContain(HAI3_SHARED_PROPERTY_THEME);
    });

    it('all 4 domains have HAI3_SHARED_PROPERTY_LANGUAGE', () => {
      expect(screenDomain.sharedProperties).toContain(HAI3_SHARED_PROPERTY_LANGUAGE);
      expect(sidebarDomain.sharedProperties).toContain(HAI3_SHARED_PROPERTY_LANGUAGE);
      expect(popupDomain.sharedProperties).toContain(HAI3_SHARED_PROPERTY_LANGUAGE);
      expect(overlayDomain.sharedProperties).toContain(HAI3_SHARED_PROPERTY_LANGUAGE);
    });
  });

  describe('Contract validation with shared properties', () => {
    it('domain provides all required properties when entry requires theme and language', () => {
      // Simulate an entry requiring theme and language
      const requiredProperties = [HAI3_SHARED_PROPERTY_THEME, HAI3_SHARED_PROPERTY_LANGUAGE];

      // Verify domain provides all required properties
      const domainProperties = screenDomain.sharedProperties;
      const allPropertiesProvided = requiredProperties.every((prop) =>
        domainProperties.includes(prop)
      );

      expect(allPropertiesProvided).toBe(true);
    });

    it('domain does NOT provide arbitrary properties not in sharedProperties', () => {
      // Simulate an entry requiring a property not in the domain
      const nonexistentProperty = 'gts.hai3.mfes.comm.shared_property.v1~nonexistent.property.v1';
      const requiredProperties = [
        HAI3_SHARED_PROPERTY_THEME,
        HAI3_SHARED_PROPERTY_LANGUAGE,
        nonexistentProperty,
      ];

      // Verify domain does NOT provide all required properties
      const domainProperties = screenDomain.sharedProperties;
      const allPropertiesProvided = requiredProperties.every((prop) =>
        domainProperties.includes(prop)
      );

      expect(allPropertiesProvided).toBe(false);
      expect(domainProperties).not.toContain(nonexistentProperty);
    });
  });

  describe('Screen Domain - extensionsTypeId Configuration', () => {
    it('screenDomain has extensionsTypeId set to HAI3_SCREEN_EXTENSION_TYPE', () => {
      expect(screenDomain.extensionsTypeId).toBe(HAI3_SCREEN_EXTENSION_TYPE);
      expect(screenDomain.extensionsTypeId).toBe(
        'gts.hai3.mfes.ext.extension.v1~hai3.screensets.layout.screen.v1~'
      );
    });

    it('screenDomain actions array contains only load_ext and mount_ext', () => {
      expect(screenDomain.actions).toEqual([HAI3_ACTION_LOAD_EXT, HAI3_ACTION_MOUNT_EXT]);
      expect(screenDomain.actions).toHaveLength(2);
    });

    it('sidebarDomain does NOT have extensionsTypeId', () => {
      expect(sidebarDomain.extensionsTypeId).toBeUndefined();
    });

    it('popupDomain does NOT have extensionsTypeId', () => {
      expect(popupDomain.extensionsTypeId).toBeUndefined();
    });

    it('overlayDomain does NOT have extensionsTypeId', () => {
      expect(overlayDomain.extensionsTypeId).toBeUndefined();
    });
  });
});
