

export function getPosition() {
return new Promise((resolve, reject) => {
if (!navigator.geolocation) {
resolve(null);
return;
}
navigator.geolocation.getCurrentPosition(
(position) => resolve({
lat: position.coords.latitude,
lng: position.coords.longitude,
accuracy: position.coords.accuracy
}),
(error) => {
resolve(null);
},
{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
);
});
}
window.getPosition = getPosition;
