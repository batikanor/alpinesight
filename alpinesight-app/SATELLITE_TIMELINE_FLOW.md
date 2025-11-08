# Satellite Timeline Feature Flow

## User Interaction Flow

```
User asks: "Show me satellite images of Paris"
                    ↓
AI calls: get_satellite_timeline(location="Paris", lat=48.8566, lng=2.3522)
                    ↓
Backend returns: {
    status: "success",
    action: "show_satellite_timeline",
    location: "Paris",
    latitude: 48.8566,
    longitude: 2.3522,
    message: "Fetching satellite imagery timeline for Paris"
}
                    ↓
Frontend (chat.tsx) processes the tool call:
    - Closes globe if open (setIsGlobeOpen(false))
    - Clears markers (clearMarkers())
    - Shows toast notification
                    ↓
Frontend (message.tsx) renders the tool result:
    - Shows ToolResult component with satellite icon
    - Renders SatelliteImageViewer component inline
                    ↓
SatelliteImageViewer component:
    - Fetches timeline from /api/wayback
    - Displays images with forward/backward buttons
    - Shows timeline slider
    - User can navigate through different dates
```

## Component Hierarchy

```
Chat
 └── PreviewMessage
      └── (for get_satellite_timeline tool)
           ├── ToolResult (shows "Satellite Imagery" badge)
           └── SatelliteImageViewer
                ├── Loading state (Loader2 spinner)
                ├── Error state (red error message)
                └── Success state:
                     ├── Header (title + location info)
                     ├── Image viewer with navigation arrows
                     └── Timeline slider
```

## Data Flow

1. **Tool Call**: AI invokes `get_satellite_timeline` with location coordinates
2. **Backend Response**: Python function returns confirmation with coordinates
3. **Globe Closes**: Frontend closes globe and clears markers
4. **Message Render**: Message component detects tool output and renders viewer
5. **API Fetch**: SatelliteImageViewer fetches from `/api/wayback?lat=X&lng=Y&zoom=18&mode=all`
6. **Display**: Timeline images displayed with interactive controls

## Key Features

- ✅ **Inline Display**: Appears directly in chat, not as popup
- ✅ **Globe Auto-Close**: Globe closes automatically when satellite timeline opens
- ✅ **Multiple Timelines**: User can request multiple locations, each appears as separate inline viewer
- ✅ **Scrollable History**: User can scroll back to previous satellite timeline requests
- ✅ **Interactive Controls**: Forward/backward buttons and slider for navigation
- ✅ **Date Information**: Shows release date and provider for each image

