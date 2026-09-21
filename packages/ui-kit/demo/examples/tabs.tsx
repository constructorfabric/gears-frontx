import { PlusIcon } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@gears-frontx/ui-kit';

import { Measure, Section } from '../shared';

export default function TabsExample() {
  return (
    <>
      <Section title="Default">
        <Tabs defaultValue="account">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
          </TabsList>
          <TabsContent value="account">Update your account details here.</TabsContent>
          <TabsContent value="password">Change your password here.</TabsContent>
        </Tabs>
      </Section>

      <Section title="Line variant">
        <Tabs defaultValue="one">
          <TabsList variant="line">
            <TabsTrigger value="one">Line one</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
          </TabsList>
          <TabsContent value="one">First panel.</TabsContent>
          <TabsContent value="two">Second panel.</TabsContent>
        </Tabs>
      </Section>

      {/* Both sizes in both variants, with the numbers that define the
          drawn model: the list's outer box, the trigger's own box and the
          one travelling indicator each line list carries. Switching a tab
          moves that one element rather than crossfading a bar per
          trigger, which is what the mid-switch frame sampling checks. */}
      <Section title="Size">
        <Measure
          of={{
            'line sm list': '#tabs-line-sm [role=tablist]',
            'line sm trigger': '#tabs-line-sm [role=tab]',
            'line sm indicator': '#tabs-line-sm [role=tablist] > [role=presentation]',
            'line default list': '#tabs-line-default [role=tablist]',
            'line default trigger': '#tabs-line-default [role=tab]',
            'line default indicator': '#tabs-line-default [role=tablist] > [role=presentation]',
            'track sm list': '#tabs-track-sm [role=tablist]',
            'track sm trigger': '#tabs-track-sm [role=tab]',
            'track default list': '#tabs-track-default [role=tablist]',
            'track default active trigger': '#tabs-track-default [role=tab][data-active]',
            'unset list': '#tabs-unset [role=tablist]',
          }}
        >
          <Tabs id="tabs-line-sm" defaultValue="one">
            <TabsList variant="line" size="sm">
              <TabsTrigger value="one">Line sm</TabsTrigger>
              <TabsTrigger value="two">Two</TabsTrigger>
            </TabsList>
            <TabsContent value="one">First panel.</TabsContent>
            <TabsContent value="two">Second panel.</TabsContent>
          </Tabs>
          <Tabs id="tabs-line-default" defaultValue="one">
            <TabsList variant="line" size="default">
              <TabsTrigger value="one">Line default</TabsTrigger>
              <TabsTrigger value="two">Two</TabsTrigger>
            </TabsList>
            <TabsContent value="one">First panel.</TabsContent>
            <TabsContent value="two">Second panel.</TabsContent>
          </Tabs>
          <Tabs id="tabs-track-sm" defaultValue="one">
            <TabsList size="sm">
              <TabsTrigger value="one">Track sm</TabsTrigger>
              <TabsTrigger value="two">Two</TabsTrigger>
            </TabsList>
            <TabsContent value="one">First panel.</TabsContent>
            <TabsContent value="two">Second panel.</TabsContent>
          </Tabs>
          <Tabs id="tabs-track-default" defaultValue="one">
            <TabsList size="default">
              <TabsTrigger value="one">Track default</TabsTrigger>
              <TabsTrigger value="two">Two</TabsTrigger>
            </TabsList>
            <TabsContent value="one">First panel.</TabsContent>
            <TabsContent value="two">Second panel.</TabsContent>
          </Tabs>
          <Tabs id="tabs-unset" defaultValue="one">
            <TabsList variant="line">
              <TabsTrigger value="one">Unset size</TabsTrigger>
              <TabsTrigger value="two">Two</TabsTrigger>
            </TabsList>
            <TabsContent value="one">First panel.</TabsContent>
            <TabsContent value="two">Second panel.</TabsContent>
          </Tabs>
        </Measure>
      </Section>

      {/* The enter animation, and the way out of it. Switching either
          list replays the fade-up on the panel that arrives; the second
          one opts out, so its panels appear settled. Watch both while
          clicking - there is nothing to measure here, the difference is
          the switch itself. */}
      <Section title="Panel enter animation">
        <Tabs defaultValue="summary">
          <TabsList variant="line">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="summary">Animated: this panel fades up as it arrives.</TabsContent>
          <TabsContent value="activity">Animated: so does this one, on every switch.</TabsContent>
          <TabsContent value="settings">Animated: and this one.</TabsContent>
        </Tabs>
        <Tabs defaultValue="summary">
          <TabsList variant="line">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="summary" animate={false}>
            Opted out: this panel appears without moving.
          </TabsContent>
          <TabsContent value="activity" animate={false}>
            Opted out: so does this one.
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Vertical">
        <Measure
          of={{
            'vertical line list': '#tabs-vertical [role=tablist]',
            'vertical line trigger': '#tabs-vertical [role=tab]',
            'vertical line indicator': '#tabs-vertical [role=tablist] > [role=presentation]',
          }}
        >
          <Tabs id="tabs-vertical" defaultValue="general" orientation="vertical">
            <TabsList variant="line">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
            </TabsList>
            <TabsContent value="general">General settings.</TabsContent>
            <TabsContent value="billing">Billing settings.</TabsContent>
          </Tabs>
          <Tabs defaultValue="general" orientation="vertical">
            <TabsList variant="line" size="sm">
              <TabsTrigger value="general">General sm</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
            </TabsList>
            <TabsContent value="general">General settings.</TabsContent>
            <TabsContent value="billing">Billing settings.</TabsContent>
          </Tabs>
        </Measure>
      </Section>

      <Section title="Disabled tab">
        <Tabs defaultValue="one">
          <TabsList>
            <TabsTrigger value="one">Enabled</TabsTrigger>
            <TabsTrigger value="two" disabled>
              Disabled
            </TabsTrigger>
          </TabsList>
          <TabsContent value="one">First panel.</TabsContent>
          <TabsContent value="two">Second panel.</TabsContent>
        </Tabs>
      </Section>

      <Section title="With icons">
        <Tabs defaultValue="one">
          <TabsList>
            <TabsTrigger value="one" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <PlusIcon size={14} strokeWidth={1.5} /> One
            </TabsTrigger>
            <TabsTrigger value="two" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <PlusIcon size={14} strokeWidth={1.5} /> Two
            </TabsTrigger>
          </TabsList>
          <TabsContent value="one">First panel.</TabsContent>
          <TabsContent value="two">Second panel.</TabsContent>
        </Tabs>
      </Section>
    </>
  );
}
