import { useState } from 'react';
import { Search, Wind, Droplets } from 'lucide-react';

interface WeatherData {
  city: string;
  temperature: number;
  description: string;
  humidity: number;
  windSpeed: number; // km/h
  iconCode: string; // OpenWeatherMap icon code (e.g., "10d")
}

function App() {
  const [city, setCity] = useState('');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weatherSummary, setWeatherSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const handleSearch = async () => {
    // Guard: no empty input
    if (!city.trim()) return;

    // Reset UI state before fetching
    setIsLoading(true);
    setError(null);

    try {
      // NOTE: Replace with your real API key
      const API_KEY = '075646e7add2bf7ec547ca29d9785389';
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
        city.trim()
      )}&appid=${API_KEY}&units=metric`;

      const response = await fetch(url);

      // Handle HTTP errors (e.g., 404 city not found)
      if (!response.ok) {
        if (response.status === 404) {
          setWeather(null);
          setError('City not found');
          return;
        }
        throw new Error('Failed to fetch weather data');
      }

      const data = await response.json();

      // Map API response to our UI model
      const mapped: WeatherData = {
        city: data.name,
        temperature: Math.round(data.main.temp),
        description: data.weather?.[0]?.description ?? '—',
        humidity: data.main.humidity,
        // Convert m/s to km/h (OpenWeatherMap returns m/s when using metric)
        windSpeed: Math.round((data.wind?.speed ?? 0) * 3.6),
        iconCode: data.weather?.[0]?.icon ?? '01d'
      };

      setWeather(mapped);
      
      // Generate natural language summary
      await generateWeatherSummary(mapped);
    } catch (e) {
      setWeather(null);
      setError('Unable to load weather. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const generateWeatherSummary = async (weatherData: WeatherData) => {
    setIsGeneratingSummary(true);
    setWeatherSummary(null);
    
    try {
      // Construct a prompt based on weather data
      const timeOfDay = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening';
      const prompt = `It's ${weatherData.temperature}°C and ${weatherData.description} in ${weatherData.city} this ${timeOfDay}.`;
      
      // Try gpt2 first (simpler text generation)
      let response = await fetch(
        'https://api-inference.huggingface.co/models/gpt2',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              max_length: 80,
              min_length: 30,
              do_sample: true,
              temperature: 0.7,
              top_p: 0.9,
            },
          }),
        }
      );

      let data;
      let summaryText = '';

      if (response.ok) {
        data = await response.json();
        
        // Extract generated text from gpt2 response
        if (Array.isArray(data) && data.length > 0) {
          summaryText = data[0].generated_text || '';
        } else if (data.generated_text) {
          summaryText = data.generated_text;
        }
        
        // Remove the original prompt from the generated text
        if (summaryText.startsWith(prompt)) {
          summaryText = summaryText.slice(prompt.length).trim();
        }
      }

      // If gpt2 didn't work or returned empty, try facebook/blenderbot_small-90M
      if (!summaryText || summaryText.trim().length < 10) {
        response = await fetch(
          'https://api-inference.huggingface.co/models/facebook/blenderbot_small-90M',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              inputs: prompt,
            }),
          }
        );

        if (response.ok) {
          data = await response.json();
          
          if (Array.isArray(data) && data.length > 0) {
            summaryText = data[0].generated_text || data[0].summary_text || '';
          } else if (data.generated_text) {
            summaryText = data.generated_text;
          } else if (data.summary_text) {
            summaryText = data.summary_text;
          }
        }
      }
      
      // Fallback: if API doesn't return expected format, create a simple summary
      if (!summaryText || summaryText.trim().length < 10) {
        const tempDesc = weatherData.temperature < 10 ? 'cool' : weatherData.temperature < 20 ? 'mild' : 'warm';
        summaryText = `It's a ${tempDesc} and ${weatherData.description} ${timeOfDay} in ${weatherData.city}, perfect for a walk.`;
      } else {
        // Clean up the generated text
        summaryText = summaryText.trim();
        // Ensure it starts with a capital letter
        if (summaryText.length > 0) {
          summaryText = summaryText.charAt(0).toUpperCase() + summaryText.slice(1);
        }
      }
      
      setWeatherSummary(summaryText);
    } catch (e) {
      // Fallback summary if API fails
      const timeOfDay = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening';
      const tempDesc = weatherData.temperature < 10 ? 'cool' : weatherData.temperature < 20 ? 'mild' : 'warm';
      setWeatherSummary(`It's a ${tempDesc} and ${weatherData.description} ${timeOfDay} in ${weatherData.city}, perfect for a walk.`);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const getWeatherIconUrl = (iconCode: string) => {
    // OpenWeatherMap icon CDN
    return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 via-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8 animate-fade-in">
          <h1 className="text-5xl font-bold text-white mb-2 drop-shadow-lg">
            WeatherNow
          </h1>
          <p className="text-blue-100 text-lg">Your real-time weather companion</p>
        </div>

        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 mb-6 animate-slide-up">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Enter city name…"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 px-6 py-4 rounded-2xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-gray-700 text-lg transition-all duration-300"
            />
            <button
              onClick={handleSearch}
              disabled={isLoading}
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 hover:from-blue-600 hover:to-purple-700 transform hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isLoading ? (
                // Small spinner while fetching
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Search
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 mb-4 text-center">
            {error}
          </div>
        )}

        {weather && (
          <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 animate-fade-in-up">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-800 mb-6">
                {weather.city}
              </h2>

              <div className="flex justify-center mb-6">
                <img
                  src={getWeatherIconUrl(weather.iconCode)}
                  alt={weather.description}
                  className="w-20 h-20"
                />
              </div>

              <div className="mb-6">
                <div className="text-6xl font-bold text-gray-800 mb-2">
                  {weather.temperature}°C
                </div>
                <div className="text-xl text-gray-600 capitalize">
                  {weather.description}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mt-8 pt-6 border-t-2 border-gray-100">
                <div className="flex items-center justify-center gap-3 bg-blue-50 rounded-2xl p-4">
                  <Droplets className="w-8 h-8 text-blue-500" />
                  <div className="text-left">
                    <div className="text-sm text-gray-600">Humidity</div>
                    <div className="text-2xl font-bold text-gray-800">
                      {weather.humidity}%
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3 bg-purple-50 rounded-2xl p-4">
                  <Wind className="w-8 h-8 text-purple-500" />
                  <div className="text-left">
                    <div className="text-sm text-gray-600">Wind Speed</div>
                    <div className="text-2xl font-bold text-gray-800">
                      {weather.windSpeed} km/h
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {weather && (
          <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-6 animate-fade-in-up mt-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-700 mb-3">Weather Summary</h3>
              {isGeneratingSummary ? (
                <div className="flex items-center justify-center gap-2 text-gray-500">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  <span>Generating summary...</span>
                </div>
              ) : weatherSummary ? (
                <p className="text-gray-700 text-lg leading-relaxed italic">
                  "{weatherSummary}"
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
