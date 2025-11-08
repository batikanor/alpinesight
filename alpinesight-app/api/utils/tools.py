import requests


def get_current_weather(latitude, longitude):
    # Format the URL with proper parameter substitution
    url = f"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto"

    try:
        # Make the API call
        response = requests.get(url)

        # Raise an exception for bad status codes
        response.raise_for_status()

        # Return the JSON response
        return response.json()

    except requests.RequestException as e:
        # Handle any errors that occur during the request
        print(f"Error fetching weather data: {e}")
        return None


def show_location_on_globe(location: str, markerColor: str = "red"):
    """
    Shows a location on the interactive globe with a marker.
    This is a client-side tool that will be handled by the frontend.
    Return a confirmation so the AI knows the action succeeded.
    """
    return {
        "status": "success",
        "action": "displayed_location",
        "location": location,
        "marker_color": markerColor,
        "message": f"Opened interactive globe and displayed {location} with {markerColor} marker"
    }


def close_globe():
    """
    Closes the globe view.
    This is a client-side tool that will be handled by the frontend.
    Return a confirmation so the AI knows the action succeeded.
    """
    return {
        "status": "success",
        "action": "closed_globe",
        "message": "Closed the globe view"
    }


TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_current_weather",
            "description": "Get the current weather at a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "latitude": {
                        "type": "number",
                        "description": "The latitude of the location",
                    },
                    "longitude": {
                        "type": "number",
                        "description": "The longitude of the location",
                    },
                },
                "required": ["latitude", "longitude"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "show_location_on_globe",
            "description": "Shows a location on the interactive 3D globe with a marker and zooms to it. Opens the globe if not already open. Use this when the user asks to find, show, locate, or view a place on the map. Examples: 'find Istanbul', 'show me Paris', 'locate Mount Everest'. IMPORTANT: This clears all previous markers, so each call shows only the new location.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The name of the location to show (e.g., 'Istanbul', 'Paris', 'Mount Everest', 'Golden Gate Bridge')",
                    },
                    "markerColor": {
                        "type": "string",
                        "description": "The color of the marker pin",
                        "enum": ["red", "blue", "green", "orange", "purple"],
                        "default": "red"
                    },
                },
                "required": ["location"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "close_globe",
            "description": "Closes the globe view, clears all markers, and returns to full-screen chat. ALWAYS use this when: (1) User asks a new question unrelated to geography/locations, (2) Conversation topic changes from locations to something else, (3) User explicitly asks to close the map. DO NOT use if the user is asking follow-up questions about the same location or related geographic queries.",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
]


AVAILABLE_TOOLS = {
    "get_current_weather": get_current_weather,
    "show_location_on_globe": show_location_on_globe,
    "close_globe": close_globe,
}
