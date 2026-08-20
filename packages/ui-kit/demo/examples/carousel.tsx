import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';

import {
  Card,
  CardContent,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@gears-frontx/ui-kit';

import { Section } from '../shared';

const SLIDE_NUMBER_STYLE: CSSProperties = {
  display: 'flex',
  aspectRatio: '1',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 'var(--text-display-size)',
  fontWeight: 'var(--text-display-weight)' as CSSProperties['fontWeight'],
};

function Slides() {
  return (
    <CarouselContent>
      {Array.from({ length: 5 }, (_, index) => (
        <CarouselItem key={index}>
          <Card>
            <CardContent style={SLIDE_NUMBER_STYLE}>{index + 1}</CardContent>
          </Card>
        </CarouselItem>
      ))}
    </CarouselContent>
  );
}

function ApiDemo() {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    api.on('select', () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  return (
    <div style={{ maxWidth: 320, marginInline: 'auto' }}>
      <Carousel setApi={setApi}>
        <Slides />
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
      <p style={{ textAlign: 'center' }}>Slide {current + 1} of 5</p>
    </div>
  );
}

export default function CarouselExample() {
  return (
    <>
      <Section title="Basic">
        <Carousel style={{ maxWidth: 320, marginInline: 'auto' }}>
          <Slides />
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </Section>
      <Section title="Sizes">
        <Carousel style={{ maxWidth: 480, marginInline: 'auto' }}>
          <CarouselContent>
            {Array.from({ length: 5 }, (_, index) => (
              <CarouselItem key={index} style={{ flexBasis: '33%' }}>
                <Card>
                  <CardContent style={SLIDE_NUMBER_STYLE}>{index + 1}</CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </Section>
      <Section title="Orientation">
        <Carousel orientation="vertical" style={{ maxWidth: 320, height: 300, marginInline: 'auto' }}>
          <Slides />
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </Section>
      <Section title="Options">
        <Carousel opts={{ align: 'start', loop: true }} style={{ maxWidth: 320, marginInline: 'auto' }}>
          <Slides />
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </Section>
      <Section title="With API">
        <ApiDemo />
      </Section>
    </>
  );
}
