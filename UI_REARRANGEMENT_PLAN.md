# UI Rearrangement Plan

## Overview
This plan outlines the restructuring of the navigation system in the Reactive Bible application to improve UX by consolidating navigation controls and creating a more intuitive interface.

## Current State Analysis

### Current Components Structure:
1. **MyHeader.tsx** - Top header with:
   - Burger menu (mobile only)
   - Logo (to be removed)
   - "Translations" button
   - Search control
   - Dark/Light mode toggle

2. **MyNavbar.tsx** - Side navigation (opened by burger) with:
   - Books list
   - Chapters list
   - Verses list

3. **SubHeader.tsx** - Secondary navigation bar with:
   - Previous chapter button (←)
   - Search button (🔍)
   - Current passage title (e.g., "Joh 1")
   - "Notes" button
   - "Add Note" button
   - Audio player button
   - Next chapter button (→)

## Proposed Changes

### Change 1: Bible Selector Trigger
**Current:** MyNavbar opens via burger menu button
**New:** MyNavbar opens when clicking the passage title (h4 element showing "Joh 1")

**Rationale:** More intuitive - users click on what they want to change

**Implementation:**
- Remove burger menu functionality from MyHeader
- Add onClick handler to the Title in SubHeader
- Keep burger menu visible on mobile but repurpose it for the new main menu

### Change 2: Rename MyNavbar Component
**Current:** `MyNavbar.tsx`
**New:** `BibleSelector.tsx` (or `PassageSelector.tsx`)

**Rationale:** More descriptive name reflecting its purpose

**Implementation:**
- Rename file: `MyNavbar.tsx` → `BibleSelector.tsx`
- Update component name and exports
- Update all imports in:
  - App.tsx
  - Any other files referencing MyNavbar

### Change 3: Remove Top Header Elements & Create New Main Menu
**Current:** Top header (MyHeader) contains:
- Burger menu
- Logo
- "Translations" button
- Search control
- Dark/Light mode toggle

**New Structure:**
- **Top Header (MyHeader)** - Simplified to:
  - Burger menu (repurposed for main menu)
  - Dark/Light mode toggle (keep visible)

- **New MainMenu Component** - Full-screen overlay with:
  - Close button (X) on the left
  - Menu items:
    - "Translations" (moved from header)
    - "Notes" (moved from SubHeader)

**Rationale:** 
- Cleaner top header with only burger menu and theme toggle
- Consolidated menu for main navigation actions
- Better mobile UX with full-screen menu
- Reduces visual clutter
- Theme toggle stays in header for quick access

**Implementation:**
1. Create new `MainMenu.tsx` component
2. Move "Translations" button from MyHeader to MainMenu
3. Move "Notes" button from SubHeader to MainMenu
4. Implement full-screen overlay with close button
5. Update burger menu to toggle MainMenu instead of BibleSelector

### Change 4: Remove "Notes" Button from SubHeader
**Current:** SubHeader shows "Notes" button (toggles between Bible/Notes view)
**New:** "Notes" button only visible in MainMenu

**Rationale:** Simplifies SubHeader, consolidates navigation

**Implementation:**
- Remove "Notes" button from SubHeader
- Move showNotes state management to App level or create context
- Add "Notes" button to MainMenu with same functionality

## Detailed Implementation Plan

### Phase 1: Rename and Refactor BibleSelector (2-3 hours)
**Files to modify:**
- `src/components/MyNavbar.tsx` → `src/components/BibleSelector.tsx`
- `src/App.tsx`

**Steps:**
1. Rename `MyNavbar.tsx` to `BibleSelector.tsx`
2. Update component name inside the file
3. Update export statement
4. Update import in `App.tsx`
5. Test that Bible selector still works

**Code changes:**
```tsx
// BibleSelector.tsx
const BibleSelector = ({ opened, setOpened }: BibleSelectorProps) => {
  // ... existing code
};
export default BibleSelector;

// App.tsx
import BibleSelector from "./components/BibleSelector";
// ...
<AppShell
  navbar={<BibleSelector opened={opened} setOpened={setOpened} />}
/>
```

### Phase 2: Create MainMenu Component (3-4 hours)
**New file:** `src/components/MainMenu.tsx`

**Features:**
- Full-screen overlay (z-index higher than other elements)
- Close button (X) on top-left
- Vertical menu with items:
  - Translations
  - Notes
  - Dark/Light mode toggle
- Smooth open/close animations
- Click outside to close
- ESC key to close

**Component structure:**
```tsx
interface MainMenuProps {
  opened: boolean;
  onClose: () => void;
  showNotes: boolean;
  setShowNotes: (show: boolean) => void;
}

const MainMenu = ({
  opened,
  onClose,
  showNotes,
  setShowNotes,
}: MainMenuProps) => {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="left"
      size="100%"
      withCloseButton={false}
      styles={{
        drawer: {
          display: 'flex',
          flexDirection: 'column',
          padding: '2rem',
        },
      }}
    >
      <ActionIcon
        onClick={onClose}
        size="lg"
        variant="transparent"
        style={{ alignSelf: 'flex-start', marginBottom: '2rem' }}
      >
        <IconX />
      </ActionIcon>
      
      <Stack spacing="xl">
        <TranslationSelector />
        
        <Button
          variant="subtle"
          size="lg"
          onClick={() => {
            setShowNotes(!showNotes);
            onClose();
          }}
        >
          {showNotes ? "View Bible" : "View Notes"}
        </Button>
      </Stack>
    </Drawer>
  );
};
```

**Mantine components to use:**
- `Drawer` - for full-screen overlay
- `Stack` - for vertical menu layout
- `ActionIcon` - for close button
- `IconX` from `@tabler/icons-react`

### Phase 3: Update MyHeader Component (2 hours)
**File to modify:** `src/components/MyHeader.tsx`

**Changes:**
1. Remove `TranslationSelector` import and component
2. Remove `SearchControl` component (keep search in SubHeader)
3. Remove logo/Image component
4. Keep burger menu but change its handler
5. Simplify layout to just burger menu and dark/light toggle

**New structure:**
```tsx
const MyHeader = ({
  colorScheme,
  toggleColorScheme,
  menuOpened,
  setMenuOpened,
}: {
  colorScheme: ColorScheme;
  toggleColorScheme: () => void;
  menuOpened: boolean;
  setMenuOpened: (opened: boolean) => void;
}) => {
  return (
    <Header height={56}>
      <Center h={56} px={10} mx="auto" 
        sx={{ display: "flex", justifyContent: "space-between" }}
      >
        <Burger
          opened={menuOpened}
          onClick={() => setMenuOpened(!menuOpened)}
          size="sm"
          title={menuOpened ? 'Close menu' : 'Open menu'}
        />
        
        <Group position="center">
          <Switch
            checked={colorScheme === "dark"}
            onChange={toggleColorScheme}
            size="lg"
            onLabel={<IconSun />}
            offLabel={<IconMoonStars />}
          />
        </Group>
      </Center>
    </Header>
  );
};
```

### Phase 4: Update SubHeader Component (1-2 hours)
**File to modify:** `src/components/SubHeader.tsx`

**Changes:**
1. Remove "Notes" button
2. Make passage title (h4) clickable to open BibleSelector
3. Keep all other functionality

**New structure:**
```tsx
const SubHeader = ({ 
  open, 
  bibleSelectorOpened,
  setBibleSelectorOpened 
}: SubHeaderProps) => {
  // ... existing state and handlers
  
  return (
    <Box sx={{ /* ... */ }}>
      <ActionIcon onClick={prevHandler}>
        <IconArrowLeft />
      </ActionIcon>
      
      <ActionIcon onClick={open}>
        <IconSearch />
      </ActionIcon>
      
      {/* Make title clickable */}
      <Title 
        order={4}
        onClick={() => setBibleSelectorOpened(true)}
        sx={{ 
          cursor: 'pointer',
          '&:hover': {
            textDecoration: 'underline',
          }
        }}
      >
        {activeBookShort} {activeChapter}
      </Title>
      
      {/* Remove Notes button */}
      
      <Button onClick={() => setOpened(true)}>
        Add Note
      </Button>
      
      <Audio />
      
      <ActionIcon onClick={nextHandler}>
        <IconArrowRight />
      </ActionIcon>
    </Box>
  );
};
```

### Phase 5: Update App Component (2 hours)
**File to modify:** `src/App.tsx`

**Changes:**
1. Add state for MainMenu
2. Lift showNotes state from Passage to App
3. Update props passed to components

**New structure:**
```tsx
export default function App() {
  const [colorScheme, setColorScheme] = useLocalStorage<ColorScheme>({
    key: "color-scheme",
    defaultValue: "dark",
  });
  const toggleColorScheme = () =>
    setColorScheme((current) => (current === "dark" ? "light" : "dark"));
  
  // BibleSelector state
  const [bibleSelectorOpened, setBibleSelectorOpened] = useState(false);
  
  // MainMenu state
  const [mainMenuOpened, setMainMenuOpened] = useState(false);
  
  // Notes view state (lifted from Passage)
  const [showNotes, setShowNotes] = useState(false);
  
  const [modalOpened, modalFn] = useDisclosure(false);

  // ... existing useEffect and useWindowEvent

  return (
    <ColorSchemeProvider
      colorScheme={colorScheme}
      toggleColorScheme={toggleColorScheme}
    >
      <MantineProvider theme={{ colorScheme }}>
        <AppShell
          navbar={
            <BibleSelector 
              opened={bibleSelectorOpened} 
              setOpened={setBibleSelectorOpened} 
            />
          }
          header={
            <MyHeader
              colorScheme={colorScheme}
              toggleColorScheme={toggleColorScheme}
              menuOpened={mainMenuOpened}
              setMenuOpened={setMainMenuOpened}
            />
          }
        >
          <Passage 
            open={modalFn.open}
            showNotes={showNotes}
            setShowNotes={setShowNotes}
            bibleSelectorOpened={bibleSelectorOpened}
            setBibleSelectorOpened={setBibleSelectorOpened}
          />
          <SearchModal opened={modalOpened} close={modalFn.close} />
          <MainMenu
            opened={mainMenuOpened}
            onClose={() => setMainMenuOpened(false)}
            showNotes={showNotes}
            setShowNotes={setShowNotes}
          />
        </AppShell>
        <Analytics />
        <SpeedInsights />
      </MantineProvider>
    </ColorSchemeProvider>
  );
}
```

### Phase 6: Update Passage Component (1 hour)
**File to modify:** `src/components/Passage.tsx`

**Changes:**
1. Remove local showNotes state
2. Accept showNotes and setShowNotes as props
3. Pass bibleSelectorOpened props to SubHeader

**New structure:**
```tsx
const Passage = ({ 
  open,
  showNotes,
  setShowNotes,
  bibleSelectorOpened,
  setBibleSelectorOpened
}: PassageProps) => {
  // Remove: const [showNotes, setShowNotes] = useState(false);
  
  // ... existing handlers
  
  return (
    <Box>
      <SubHeader
        open={open}
        bibleSelectorOpened={bibleSelectorOpened}
        setBibleSelectorOpened={setBibleSelectorOpened}
      />
      <Box h="80vh">
        {showNotes ? (
          <NotesView onViewInBible={handleViewInBible} />
        ) : (
          <PassageView />
        )}
      </Box>
    </Box>
  );
};
```

## Testing Checklist

### Functionality Tests:
- [ ] BibleSelector opens when clicking passage title (h4)
- [ ] BibleSelector closes after selecting a verse
- [ ] MainMenu opens when clicking burger menu
- [ ] MainMenu closes when clicking X button
- [ ] MainMenu closes when clicking outside (if implemented)
- [ ] MainMenu closes when pressing ESC
- [ ] Translations button works in MainMenu
- [ ] Notes toggle works in MainMenu
- [ ] Dark/Light mode toggle works in header
- [ ] Search modal still works
- [ ] Add Note button still works
- [ ] Audio player still works
- [ ] Previous/Next chapter navigation works

### Visual Tests:
- [ ] Header looks clean and uncluttered
- [ ] SubHeader has proper spacing without Notes button
- [ ] MainMenu has smooth animations
- [ ] MainMenu covers entire screen
- [ ] Close button (X) is visible and accessible
- [ ] All menu items are properly styled
- [ ] Responsive design works on mobile
- [ ] Responsive design works on tablet
- [ ] Responsive design works on desktop

### Edge Cases:
- [ ] Multiple rapid clicks on burger menu
- [ ] Opening BibleSelector while MainMenu is open
- [ ] Opening MainMenu while BibleSelector is open
- [ ] Keyboard navigation works properly
- [ ] Focus management is correct

## Files Summary

### Files to Create:
1. `src/components/MainMenu.tsx` - New full-screen menu component

### Files to Rename:
1. `src/components/MyNavbar.tsx` → `src/components/BibleSelector.tsx`

### Files to Modify:
1. `src/App.tsx` - State management and component integration
2. `src/components/MyHeader.tsx` - Simplify and repurpose burger menu
3. `src/components/SubHeader.tsx` - Remove Notes button, make title clickable
4. `src/components/Passage.tsx` - Accept showNotes as props

### Files to Review (may need updates):
1. `src/components/TranslationSelector.tsx` - Ensure it works in MainMenu
2. Any test files related to modified components

## Estimated Timeline

| Phase | Task | Time Estimate |
|-------|------|---------------|
| 1 | Rename MyNavbar to BibleSelector | 2-3 hours |
| 2 | Create MainMenu component | 3-4 hours |
| 3 | Update MyHeader | 2 hours |
| 4 | Update SubHeader | 1-2 hours |
| 5 | Update App component | 2 hours |
| 6 | Update Passage component | 1 hour |
| 7 | Testing and bug fixes | 2-3 hours |
| **Total** | | **13-17 hours** |

## Design Considerations

### MainMenu Styling:
- Use Mantine's Drawer component for consistency
- Full-screen overlay with backdrop
- Smooth slide-in animation from left
- Close button should be prominent but not overwhelming
- Menu items should be large and touch-friendly
- Adequate spacing between items
- Consider adding icons to menu items for better UX

### BibleSelector Trigger:
- Add visual feedback on hover (underline, color change)
- Consider adding a small icon next to title to indicate it's clickable
- Ensure accessibility (keyboard navigation, screen readers)

### Responsive Behavior:
- MainMenu should work well on all screen sizes
- Consider different layouts for mobile vs desktop
- Ensure touch targets are large enough (min 44x44px)

## Potential Enhancements (Future):
1. Add keyboard shortcuts display in MainMenu
2. Add user preferences/settings in MainMenu
3. Add recent passages history
4. Add bookmarks/favorites access
5. Add help/tutorial link
6. Add about/version info

## Notes:
- Maintain existing functionality throughout refactoring
- Ensure all existing tests pass (update as needed)
- Follow existing code style and patterns
- Use TypeScript types consistently
- Maintain accessibility standards
- Test on multiple browsers and devices
