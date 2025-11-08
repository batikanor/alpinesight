# Satellite Timeline UI Changes

## Summary
Changed the satellite timeline feature from a bottom popup overlay to inline chat display.

## What Changed

### 1. New Component: `satellite-image-viewer.tsx`
- Created a new inline component for displaying satellite imagery in the chat
- Features the same forward/backward navigation buttons
- Shows image timeline slider
- Displays loading states and error handling
- Styled to match the chat interface (border, rounded corners, muted background)

### 2. Updated `message.tsx`
- Added import for `SatelliteImageViewer`
- Modified the tool result rendering to show satellite timeline inline
- When `get_satellite_timeline` tool is called, it now renders both:
  - A `ToolResult` component showing the action status
  - The `SatelliteImageViewer` component displaying the imagery

### 3. Updated `chat.tsx`
- Modified the `get_satellite_timeline` tool execution to close the globe when triggered
- Removed the `showSatelliteTimeline` function call (no longer needed)
- Removed `showSatelliteTimeline` from the useGlobe hook dependencies

### 4. Updated `layout-wrapper.tsx`
- Removed the satellite timeline popup component
- Removed satellite timeline state management from the layout
- Simplified the component to only handle globe modal

### 5. Updated `globe-context.tsx`
- Removed `SatelliteTimelineData` interface (no longer needed)
- Removed `satelliteTimeline` state
- Removed `setSatelliteTimeline` and `showSatelliteTimeline` methods
- Cleaned up the context to focus only on globe functionality

## Behavior

### Before
- When user requests satellite imagery, a popup appears at the bottom of the screen
- The popup overlays the chat and globe view
- User has to manually close it

### After
- When user requests satellite imagery:
  1. The globe view closes automatically (if open)
  2. All markers are cleared
  3. The satellite imagery viewer appears inline in the chat message
  4. User can scroll through chat history with the imagery still visible
  5. Multiple satellite timeline requests create separate inline viewers

## Benefits
- Better integration with chat flow
- No need to manage popup state
- Users can scroll back to see previous satellite imagery requests
- Cleaner UI with less overlapping elements
- Globe automatically closes to give full attention to satellite imagery

