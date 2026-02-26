# TurboIAM Design System Reference

> Read this INSTEAD of opening Button.tsx, Badge.tsx, Card.tsx, Input.tsx, or PageHeader.tsx.
<!-- AUTO-MAINTENANCE: Update this file when... -->
<!-- - Adding a new component or variant -->
<!-- - Changing a color token or hex value -->
<!-- - Changing layout dimensions (sidebar width, header height) -->
<!-- - Updating component prop signatures -->

---

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| **Primary** | `#4F46E5` | Buttons, active nav, links, icons |
| Primary hover | `#4338CA` | Button hover, link hover |
| Primary muted | `#A5B4FC` | Disabled primary buttons |
| Primary bg | `#EEF2FF` | Icon containers, info badge bg, role badge bg |
| Primary border | `rgba(79,70,229,0.25)` | Role badge border |
| **Success** | `#16A34A` | Active status, success icons |
| Success bg | `#F0FDF4` | Success badge bg, success icon container |
| Success dark | `#15803D` | Success button hover |
| **Warning** | `#D97706` | Pending status, warning icons |
| Warning bg | `#FFFBEB` | Warning badge bg |
| **Error** | `#DC2626` | Error state, danger buttons, required * |
| Error bg | `#FEF2F2` | Error badge bg |
| Error dark | `#B91C1C` | Danger button hover |
| **Purple** | `#7C3AED` | Secondary accent |
| Purple bg | `#F5F3FF` | Purple badge/icon bg |
| **Yellow** | `#CA8A04` | Yellow badge text |
| Yellow bg | `#FEFCE8` | Yellow badge bg |
| **Text primary** | `#111827` | Headings, page titles |
| Text body | `#374151` | Body text, nav labels |
| Text secondary | `#6B7280` | Subtitles, labels, inactive nav |
| Text muted | `#9CA3AF` | Placeholders, timestamps, empty states |
| **Border** | `#E9EAEB` | Card borders |
| Border form | `#d5d7da` | Input/select borders |
| **BG page** | `#F9FAFB` | App-wide background |
| BG input | `#F3F4F6` | Search bars, disabled inputs, hover states |
| BG surface | `#ffffff` | Cards, dropdowns |
| Focus ring | `#007aff` | Input focus state |

---

## Layout Dimensions

| Element | Value |
|---------|-------|
| Sidebar width | `240px` |
| Header height | `72px` |
| Content padding-top | `72px` (below header) |
| Content padding-left | `240px` (beside sidebar) |
| Content inner padding | `px-10 py-8` |
| Card border radius | `rounded-xl` (12px) |
| Button border radius | `rounded-lg` (8px) md/sm, `rounded-xl` lg |

---

## Components

### Button — `src/components/ui/Button.tsx`
```tsx
<Button
  variant="primary|outline|secondary|success|danger|ghost"  // default: primary
  size="sm|md|lg"     // default: md
  loading={boolean}   // shows spinner, disables button
  disabled={boolean}
  onClick={...}
>
  Label
</Button>
```

| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| `primary` | `#4F46E5` → `#4338CA` | white | — |
| `outline` | white → `#F9FAFB` | `#374151` | `#D1D5DB` |
| `secondary` | white → `#F3F4F6` | `#6B7280` | `#D1D5DB` |
| `success` | `#16A34A` → `#15803D` | white | — |
| `danger` | `#DC2626` → `#B91C1C` | white | — |
| `ghost` | transparent → `#F3F4F6` | `#6B7280` | — |

| Size | Height | Padding | Font |
|------|--------|---------|------|
| `sm` | h-8 | px-3 | 12.5px |
| `md` | h-10 | px-5 | 13.5px |
| `lg` | h-11 | px-6 | 14px |

---

### Card — `src/components/ui/Card.tsx`
```tsx
<Card padding="sm|md|lg" className="">
  {children}
</Card>

<StatsCard
  label="Total Users"
  value={42}
  icon={<Users size={20} className="text-[#4F46E5]" />}
  iconBg="bg-[#EEF2FF]"    // optional, default bg-[#EEF2FF]
  trend={{ value: 12, label: "vs last month" }}  // optional
/>
```
- Card: `bg-white rounded-xl border border-[#E9EAEB] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.06)]`
- Padding: sm=p-4, md=p-6, lg=p-8

---

### Input / Select — `src/components/ui/Input.tsx`
```tsx
<Input
  label="Email Address"
  hint="We'll never share your email"   // shown when no error
  error="This field is required"        // shown instead of hint, turns border red
  required                              // adds red * to label
  placeholder="..."
  // all standard HTML input props
/>

<Select
  label="Role"
  options={[{ value: "SUPER_ADMIN", label: "Super Admin" }]}
  placeholder="Select a role"
  error="..."
/>
```
- Height: `h-12` (48px), border: `#d5d7da`, focus border+ring: `#007aff`
- Error state: border+ring `#FF3B30`
- Label color: `#717680`, text: `#101828`

---

### StatusBadge / RoleBadge — `src/components/ui/Badge.tsx`
```tsx
<StatusBadge variant="success|warning|error|info|purple|yellow|default">
  Active
</StatusBadge>

<RoleBadge label="SUPER_ADMIN" />
```

| Variant | BG | Text |
|---------|----|----- |
| `success` | `#F0FDF4` | `#16A34A` |
| `warning` | `#FFFBEB` | `#D97706` |
| `error` | `#FEF2F2` | `#DC2626` |
| `info` | `#EEF2FF` | `#4F46E5` |
| `purple` | `#F5F3FF` | `#7C3AED` |
| `yellow` | `#FEFCE8` | `#CA8A04` |
| `default` | `#F3F4F6` | `#6B7280` |

RoleBadge: `bg-[#EEF2FF] border border-[rgba(79,70,229,0.25)] text-[#4F46E5]`

`statusVariantMap` maps: `NOT_STARTED→default`, `PENDING→warning`, `IN_PROGRESS→info`, `APPROVED→success`, `REJECTED→error`

---

### PageHeader — `src/components/common/PageHeader.tsx`
```tsx
<PageHeader
  title="Dashboard"
  subtitle="Welcome back, here's what's happening."
  showRoleBadge={false}   // default false — only show when explicitly needed
  actions={<Button>Create</Button>}  // optional right-side actions
/>
```
- Title: `text-[28px] font-bold text-[#111827]`
- Subtitle: `text-[#6B7280] text-sm`
- Bottom margin: `mb-8`

---

## Sidebar

### Active Nav Item
```
bg-[#4F46E5] text-white shadow-sm rounded-lg
```
### Inactive Nav Item
```
text-[#6B7280] hover:bg-[#F3F4F6] rounded-lg
```
### Icon size: 18px, padding: `px-3 py-2.5`

---

## Spacing Conventions
- Gap between stat cards: `gap-5`
- Gap between content sections: `gap-5`
- Card section spacing: `mb-5` or `mb-6`
- Form field gap: `gap-1.5` (label→input), `gap-4` or `gap-6` between fields
- Empty state: `py-12` with centered icon (w-11 h-11) in `bg-[#F3F4F6] rounded-xl`

---

## Icon Usage (lucide-react)
- Nav icons: `size={18}`
- Card/section icons: `size={16}` to `size={22}`
- Stats card icons: `size={20}`
- Always wrap in a sized container when used as icon badge: `w-10 h-10 rounded-xl flex items-center justify-center`
