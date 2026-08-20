import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '@gears-frontx/ui-kit';

import {
  EllipsisVerticalIcon,
  HouseIcon,
  InboxIcon,
  PlusIcon,
  SettingsIcon,
} from 'lucide-react';

import { Row, Section } from '../shared';

function MiniShell({ label, collapsible }: { label: string; collapsible: 'offcanvas' | 'icon' | 'none' }) {
  return (
    <div style={{ height: '14rem', width: '12rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <SidebarProvider style={{ minHeight: '100%' }}>
        <Sidebar collapsible={collapsible}>
          <SidebarHeader>{label}</SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive tooltip="Home">
                      <HouseIcon size={16} />
                      <span>Home</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Inbox">
                      <InboxIcon size={16} />
                      <span>Inbox</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <div style={{ padding: 'var(--space-2)' }}>
            <SidebarTrigger />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

function VariantShell({ variant }: { variant: 'sidebar' | 'floating' | 'inset' }) {
  return (
    <div style={{ height: '14rem', width: '12rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', padding: variant === 'floating' ? 'var(--space-2)' : 0 }}>
      <SidebarProvider style={{ minHeight: '100%' }}>
        <Sidebar variant={variant} collapsible="icon">
          <SidebarHeader>{variant}</SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive tooltip="Home">
                      <HouseIcon size={16} />
                      <span>Home</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <div style={{ padding: 'var(--space-2)' }}>
            <SidebarTrigger />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

export default function SidebarExample() {
  return (
    <>
      <Section title="Collapsible modes">
        <Row>
          <MiniShell label="offcanvas" collapsible="offcanvas" />
          <MiniShell label="icon" collapsible="icon" />
          <MiniShell label="none" collapsible="none" />
        </Row>
      </Section>

      <Section title="Variants">
        <Row>
          <VariantShell variant="sidebar" />
          <VariantShell variant="floating" />
          <VariantShell variant="inset" />
        </Row>
      </Section>

      <Section title="Groups, badges, actions & submenu">
        <div style={{ height: '26rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <SidebarProvider style={{ minHeight: '100%' }}>
            <Sidebar collapsible="icon">
              <SidebarHeader>Acme Inc</SidebarHeader>
              <SidebarSeparator />
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupLabel>Platform</SidebarGroupLabel>
                  <SidebarGroupAction title="Add project">
                    <PlusIcon size={14} />
                  </SidebarGroupAction>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton isActive tooltip="Inbox">
                          <InboxIcon size={16} />
                          <span>Inbox</span>
                        </SidebarMenuButton>
                        <SidebarMenuBadge>24</SidebarMenuBadge>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton tooltip="Home">
                          <HouseIcon size={16} />
                          <span>Home</span>
                        </SidebarMenuButton>
                        <SidebarMenuAction showOnHover title="More">
                          <EllipsisVerticalIcon size={14} />
                        </SidebarMenuAction>
                        <SidebarMenuSub>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton>Overview</SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton isActive>Activity</SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </SidebarMenuSub>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
              <SidebarFooter>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Settings">
                      <SettingsIcon size={16} />
                      <span>Settings</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarFooter>
              <SidebarRail />
            </Sidebar>
            <SidebarInset>
              <div style={{ padding: 'var(--space-2)' }}>
                <SidebarTrigger />
              </div>
              <SidebarSeparator />
              <div style={{ padding: 'var(--space-4)' }}>Page content goes here.</div>
            </SidebarInset>
          </SidebarProvider>
        </div>
      </Section>
    </>
  );
}
