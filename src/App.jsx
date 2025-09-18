import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDirections from '@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions.css';
import './App.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_ACCESS_TOKEN; // CRA environment variable

const App = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const directions = useRef(null);
  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');

  useEffect(() => {
    // Initialize map
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-74.0060, 40.7128], // Default: New York City
      zoom: 10,
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl());

    // Initialize Mapbox Directions for draggable waypoints
    directions.current = new MapboxDirections({
      accessToken: mapboxgl.accessToken,
      unit: 'metric',
      profile: 'mapbox/driving', // Fallback profile for dragging
      interactive: true, // Enable draggable waypoints
      controls: {
        inputs: false, // Use custom inputs
        instructions: true, // Show route instructions
      },
    });

    map.current.addControl(directions.current, 'top-left');

    // Handle route updates when waypoints are dragged
    directions.current.on('route', async () => {
      const waypoints = directions.current.getWaypoints();
      if (waypoints.length >= 2) {
        const coords = waypoints
          .map((wp) => `${wp.coordinates[1]},${wp.coordinates[0]}`)
          .join('|');
        try {
          const response = await fetch(
            `https://api.geoapify.com/v1/routing?waypoints=${coords}&mode=truck&apiKey=${process.env.REACT_APP_GEOAPIFY_API_KEY}`
          );
          const data = await response.json();

          if (data.features.length) {
            const route = data.features[0].geometry;

            // Remove existing route layer
            if (map.current.getSource('route')) {
              map.current.removeLayer('route');
              map.current.removeSource('route');
            }

            // Add new route
            map.current.addSource('route', {
              type: 'geojson',
              data: {
                type: 'Feature',
                geometry: route,
              },
            });

            map.current.addLayer({
              id: 'route',
              type: 'line',
              source: 'route',
              layout: {
                'line-join': 'round',
                'line-cap': 'round',
              },
              paint: {
                'line-color': '#007cbf',
                'line-width': 6,
              },
            });

            // Fit map to route bounds
            const coordinates = route.coordinates;
            const bounds = coordinates.reduce(
              (bounds, coord) => bounds.extend(coord),
              new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
            );
            map.current.fitBounds(bounds, { padding: 50 });
          } else {
            alert('No route found for updated waypoints.');
          }
        } catch (error) {
          console.error('Geoapify error:', error);
          alert('Error updating route. Please try again.');
        }
      }
    });

    // Allow clicking on route to add draggable waypoints
    map.current.on('click', (e) => {
      const features = map.current.queryRenderedFeatures(e.point, {
        layers: ['directions-route-line'],
      });

      if (features.length) {
        // Add a new waypoint at the clicked point
        const coords = e.lngLat;
        const waypoints = directions.current.getWaypoints();
        const newWaypoint = {
          coordinates: [coords.lng, coords.lat],
          approach: 'unrestricted',
        };
        directions.current.setWaypoints([...waypoints, newWaypoint]);
      }
    });

    return () => map.current.remove(); // Cleanup on unmount
  }, []);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (startAddress && endAddress) {
      // Geocode addresses using Mapbox (or Geoapify Geocoding)
      const [startData, endData] = await Promise.all([
        fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            startAddress
          )}.json?access_token=${mapboxgl.accessToken}`
        ).then((res) => res.json()),
        fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            endAddress
          )}.json?access_token=${mapboxgl.accessToken}`
        ).then((res) => res.json()),
      ]);

      const startCoords = startData.features[0]?.geometry.coordinates;
      const endCoords = endData.features[0]?.geometry.coordinates;

      if (startCoords && endCoords) {
        // Fetch truck route from Geoapify
        const response = await fetch(
          `https://api.geoapify.com/v1/routing?waypoints=${startCoords[1]},${startCoords[0]}|${endCoords[1]},${endCoords[0]}&mode=truck&apiKey=${process.env.REACT_APP_GEOAPIFY_API_KEY}`
        );
        const data = await response.json();

        if (data.features.length) {
          const route = data.features[0].geometry;

          // Remove existing route layer
          if (map.current.getSource('route')) {
            map.current.removeLayer('route');
            map.current.removeSource('route');
          }

          // Add new route
          map.current.addSource('route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: route,
            },
          });

          map.current.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#007cbf',
              'line-width': 6,
            },
          });

          // Fit map to route bounds
          const coordinates = route.coordinates;
          const bounds = coordinates.reduce(
            (bounds, coord) => bounds.extend(coord),
            new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
          );
          map.current.fitBounds(bounds, { padding: 50 });

          // Update waypoints for dragging
          directions.current.setOrigin(startCoords);
          directions.current.setDestination(endCoords);
        } else {
          alert('No route found. Please try different addresses.');
        }
      } else {
        alert('Invalid addresses. Please try again.');
      }
    } else {
      alert('Please enter both start and end addresses.');
    }
  };

  return (
    <div className="container">
      <div className="input-section">
        <h2>Plan Vehicle Route</h2>
        <form onSubmit={handleSubmit}>
          <label>Start Address:</label>
          <input
            type="text"
            value={startAddress}
            onChange={(e) => setStartAddress(e.target.value)}
            placeholder="Enter start address"
            required
          />
          <label>End Address:</label>
          <input
            type="text"
            value={endAddress}
            onChange={(e) => setEndAddress(e.target.value)}
            placeholder="Enter end address"
            required
          />
          <button type="submit">Show Route</button>
        </form>
      </div>
      <div ref={mapContainer} className="map-container" />
    </div>
  );
};

export default App;