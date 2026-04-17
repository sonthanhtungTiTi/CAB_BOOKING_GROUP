import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix lỗi icon mặc định của Leaflet trong React/Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Component hỗ trợ auto focus map vào tọa độ center mới
function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

const MapViewer = ({ center = [10.762622, 106.660172], markers = [] }) => {
  return (
    <div className="w-full h-full rounded-xl overflow-hidden border border-slate-700 shadow-xl relative z-0">
      <MapContainer 
        center={center} 
        zoom={15} 
        scrollWheelZoom={true} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        <MapUpdater center={center} />

        {markers.map((pos, idx) => (
          <Marker key={idx} position={[pos.lat, pos.lng]} />
        ))}
      </MapContainer>
    </div>
  );
};

export default MapViewer;
