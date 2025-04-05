const WeatherDebug = ({ weatherData }) => {
    return (
        <div>
            <h2>Debug: Raaka säädata</h2>
            <pre>{JSON.stringify(weatherData, null, 2)}</pre>
        </div>
    );
};

export default WeatherDebug;
