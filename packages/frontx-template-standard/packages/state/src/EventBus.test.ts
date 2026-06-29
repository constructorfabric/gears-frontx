import { describe, expect, it, vi } from 'vitest';
import { EventBusImpl } from './EventBus';

type TestEventPayloadMap = {
  'test/valueChanged': { value: number };
  'test/once': { label: string };
};

describe('EventBusImpl', () => {
  it('delivers payloads to active subscribers', () => {
    const bus = new EventBusImpl<TestEventPayloadMap>();
    const handler = vi.fn<(payload: { value: number }) => void>();

    bus.on('test/valueChanged', handler);
    bus.emit('test/valueChanged', { value: 7 });

    expect(handler).toHaveBeenCalledWith({ value: 7 });
  });

  it('stops delivering events after unsubscribe is called', () => {
    const bus = new EventBusImpl<TestEventPayloadMap>();
    const handler = vi.fn<(payload: { value: number }) => void>();

    const subscription = bus.on('test/valueChanged', handler);
    subscription.unsubscribe();
    bus.emit('test/valueChanged', { value: 11 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('removes once handlers after the first event', () => {
    const bus = new EventBusImpl<TestEventPayloadMap>();
    const handler = vi.fn<(payload: { label: string }) => void>();

    bus.once('test/once', handler);
    bus.emit('test/once', { label: 'first' });
    bus.emit('test/once', { label: 'second' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ label: 'first' });
  });

  it('propagates handler errors to the emitter', () => {
    const bus = new EventBusImpl<TestEventPayloadMap>();
    const error = new Error('handler failed');

    bus.on('test/valueChanged', () => {
      throw error;
    });

    expect(() => {
      bus.emit('test/valueChanged', { value: 1 });
    }).toThrow(error);
  });

  it('ignores emits when no subscribers are registered', () => {
    const bus = new EventBusImpl<TestEventPayloadMap>();

    expect(() => {
      bus.emit('test/valueChanged', { value: 5 });
    }).not.toThrow();
  });

  it('clears all handlers for a specific event', () => {
    const bus = new EventBusImpl<TestEventPayloadMap>();
    const valueHandler = vi.fn<(payload: { value: number }) => void>();
    const onceHandler = vi.fn<(payload: { label: string }) => void>();

    bus.on('test/valueChanged', valueHandler);
    bus.on('test/once', onceHandler);

    bus.clear('test/valueChanged');
    bus.emit('test/valueChanged', { value: 3 });
    bus.emit('test/once', { label: 'still-active' });

    expect(valueHandler).not.toHaveBeenCalled();
    expect(onceHandler).toHaveBeenCalledWith({ label: 'still-active' });
  });

  it('clears every registered handler', () => {
    const bus = new EventBusImpl<TestEventPayloadMap>();
    const valueHandler = vi.fn<(payload: { value: number }) => void>();
    const onceHandler = vi.fn<(payload: { label: string }) => void>();

    bus.on('test/valueChanged', valueHandler);
    bus.on('test/once', onceHandler);

    bus.clearAll();
    bus.emit('test/valueChanged', { value: 8 });
    bus.emit('test/once', { label: 'cleared' });

    expect(valueHandler).not.toHaveBeenCalled();
    expect(onceHandler).not.toHaveBeenCalled();
  });
});
