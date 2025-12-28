'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, Navigation, Edit3, CheckCircle2, Globe } from 'lucide-react';

interface LocationSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  presetCountry?: 'UAE' | 'Philippines';
}

interface Region {
  id: number;
  psgc_code: string;
  region_name: string;
  region_code: string;
}

interface Province {
  province_code: string;
  province_name: string;
  psgc_code: string;
  region_code: string;
}

interface City {
  city_code: string;
  city_name: string;
  province_code: string;
  psgc_code: string;
  region_desc: string;
}

interface Barangay {
  brgy_code: string;
  brgy_name: string;
  city_code: string;
  province_code: string;
  region_code: string;
}

interface UAECity {
  emirate: string;
  city_code: string;
  city_name: string;
  districts: UAEDistrict[];
}

interface UAEDistrict {
  district_code: string;
  district_name: string;
  areas: string[];
}

// UAE Emirates
const UAE_EMIRATES = [
  'Abu Dhabi',
  'Dubai',
  'Sharjah',
  'Ajman',
  'Umm Al Quwain',
  'Ras Al Khaimah',
  'Fujairah'
];

export default function LocationSelector({ label, value, onChange, required, presetCountry }: LocationSelectorProps) {
  const [inputMode, setInputMode] = useState<'dropdown' | 'manual'>('dropdown');
  const [manualAddress, setManualAddress] = useState('');
  const [country, setCountry] = useState<'UAE' | 'Philippines' | ''>(presetCountry || '');
  const [uaeEmirate, setUaeEmirate] = useState('');
  const [uaeCity, setUaeCity] = useState('');
  const [uaeDistrict, setUaeDistrict] = useState('');
  const [uaeArea, setUaeArea] = useState('');
  const [uaeLandmark, setUaeLandmark] = useState('');
  const [phRegion, setPhRegion] = useState('');
  const [phProvince, setPhProvince] = useState('');
  const [phCity, setPhCity] = useState('');
  const [phBarangay, setPhBarangay] = useState('');
  const [phLandmark, setPhLandmark] = useState('');

  // Data states
  const [uaeCities, setUaeCities] = useState<UAECity[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  
  // Filtered UAE data based on selections
  const filteredUAECities = useMemo(() => {
    if (!uaeEmirate || uaeCities.length === 0) return [];
    return uaeCities.filter(city => city.emirate === uaeEmirate);
  }, [uaeEmirate, uaeCities]);

  const filteredUAEDistricts = useMemo(() => {
    if (!uaeCity || filteredUAECities.length === 0) return [];
    const selectedCity = filteredUAECities.find(city => city.city_code === uaeCity);
    return selectedCity?.districts || [];
  }, [uaeCity, filteredUAECities]);

  const filteredUAEAreas = useMemo(() => {
    if (!uaeDistrict || filteredUAEDistricts.length === 0) return [];
    const selectedDistrict = filteredUAEDistricts.find(district => district.district_code === uaeDistrict);
    return selectedDistrict?.areas || [];
  }, [uaeDistrict, filteredUAEDistricts]);

  // Load UAE cities when UAE is selected
  useEffect(() => {
    if (country === 'UAE' && uaeCities.length === 0) {
      fetch('/data/uae-cities.json')
        .then((res) => res.json())
        .then((data) => setUaeCities(data))
        .catch((err) => console.error('Error loading UAE cities:', err));
    }
  }, [country, uaeCities.length]);

  // Load regions when Philippines is selected
  useEffect(() => {
    if (country === 'Philippines' && regions.length === 0) {
      fetch('/data/region.json')
        .then((res) => res.json())
        .then((data) => setRegions(data))
        .catch((err) => console.error('Error loading regions:', err));
    }
  }, [country, regions.length]);

  // Load provinces based on selected region
  useEffect(() => {
    if (country === 'Philippines') {
      if (phRegion) {
        // Load all provinces and filter by region
        fetch('/data/province.json')
          .then((res) => res.json())
          .then((data) => {
            const filteredProvinces = data.filter(
              (p: Province) => p.region_code === phRegion
            );
            setProvinces(filteredProvinces);
          })
          .catch((err) => console.error('Error loading provinces:', err));
        setPhProvince(''); // Reset province when region changes
        setPhCity(''); // Reset city
        setPhBarangay(''); // Reset barangay
        setCities([]); // Clear cities
        setBarangays([]); // Clear barangays
      } else {
        setProvinces([]);
      }
    }
  }, [phRegion, country]);

  // Load cities based on selected province
  useEffect(() => {
    if (country === 'Philippines' && phProvince) {
      fetch('/data/city.json')
        .then((res) => res.json())
        .then((data) => {
          const filteredCities = data.filter(
            (c: City) => c.province_code === phProvince
          );
          setCities(filteredCities);
        })
        .catch((err) => console.error('Error loading cities:', err));
      setPhCity(''); // Reset city when province changes
      setPhBarangay(''); // Reset barangay
      setBarangays([]); // Clear barangays
    } else {
      setCities([]);
    }
  }, [phProvince, country]);

  // Load barangays based on selected city
  useEffect(() => {
    if (country === 'Philippines' && phCity) {
      fetch('/data/barangay.json')
        .then((res) => res.json())
        .then((data) => {
          const filteredBarangays = data.filter(
            (b: Barangay) => b.city_code === phCity
          );
          setBarangays(filteredBarangays);
        })
        .catch((err) => console.error('Error loading barangays:', err));
      setPhBarangay(''); // Reset barangay when city changes
    } else {
      setBarangays([]);
    }
  }, [phCity, country]);

  // Build location string from current selections
  // This function will be called when selections change
  const buildLocationString = () => {
    // If manual mode, return manual address directly
    if (inputMode === 'manual') {
      return manualAddress;
    }
    
    if (country === 'UAE') {
      if (!uaeEmirate) return '';
      
      const locationParts = [];
      
      // Add landmark if provided
      if (uaeLandmark) {
        locationParts.push(uaeLandmark);
      }
      
      // Add area if selected
      if (uaeArea) {
        locationParts.push(uaeArea);
      }
      
      // Add district if selected
      if (uaeDistrict) {
        const district = filteredUAEDistricts.find(d => d.district_code === uaeDistrict);
        if (district) locationParts.push(district.district_name);
      }
      
      // Add city if selected
      if (uaeCity) {
        const city = filteredUAECities.find(c => c.city_code === uaeCity);
        if (city) locationParts.push(city.city_name);
      }
      
      // Add emirate (required)
      locationParts.push(uaeEmirate);
      locationParts.push('UAE');
      
      return locationParts.length > 1 ? locationParts.join(', ') : '';
    } else if (country === 'Philippines') {
      if (!phRegion) return '';
      
      const locationParts = [];
      
      // Add barangay if selected and available
      if (phBarangay) {
        const barangay = barangays.find((b) => b.brgy_code === phBarangay);
        if (barangay) locationParts.push(barangay.brgy_name);
      }
      if (phLandmark) {
        locationParts.unshift(phLandmark);
      }
      
      // Add city if selected and available
      if (phCity) {
        const city = cities.find((c) => c.city_code === phCity);
        if (city) locationParts.push(city.city_name);
      }
      
      // Add province if selected and available
      if (phProvince) {
        const province = provinces.find((p) => p.province_code === phProvince);
        if (province) locationParts.push(province.province_name);
      }
      
      // Add region (required) if available
      if (phRegion) {
        const region = regions.find((r) => r.region_code === phRegion);
        if (region) {
          locationParts.push(region.region_name);
          locationParts.push('Philippines');
        }
      }
      
      return locationParts.length > 1 ? locationParts.join(', ') : '';
    }
    return '';
  };

  // Track previous values to detect actual changes
  const prevValuesRef = useRef({
    inputMode: 'dropdown' as 'dropdown' | 'manual',
    manualAddress: '',
    country: '',
    uaeEmirate: '',
    uaeCity: '',
    uaeDistrict: '',
    uaeArea: '',
    uaeLandmark: '',
    phRegion: '',
    phProvince: '',
    phCity: '',
    phBarangay: '',
    phLandmark: '',
  });

  // Use ref for onChange to prevent infinite loops
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Track the last location string we sent to prevent duplicate updates
  const lastSentLocationRef = useRef<string>('');

  // Update parent only when selection values actually change
  useEffect(() => {
    const currentValues = {
      inputMode,
      manualAddress,
      country,
      uaeEmirate,
      uaeCity,
      uaeDistrict,
      uaeArea,
      uaeLandmark,
      phRegion,
      phProvince,
      phCity,
      phBarangay,
      phLandmark,
    };

    // Check if any selection value actually changed
    const hasChanged = 
      prevValuesRef.current.country !== currentValues.country ||
      prevValuesRef.current.inputMode !== currentValues.inputMode ||
      prevValuesRef.current.manualAddress !== currentValues.manualAddress ||
      prevValuesRef.current.uaeEmirate !== currentValues.uaeEmirate ||
      prevValuesRef.current.uaeCity !== currentValues.uaeCity ||
      prevValuesRef.current.uaeDistrict !== currentValues.uaeDistrict ||
      prevValuesRef.current.uaeArea !== currentValues.uaeArea ||
      prevValuesRef.current.uaeLandmark !== currentValues.uaeLandmark ||
      prevValuesRef.current.phRegion !== currentValues.phRegion ||
      prevValuesRef.current.phProvince !== currentValues.phProvince ||
      prevValuesRef.current.phCity !== currentValues.phCity ||
      prevValuesRef.current.phBarangay !== currentValues.phBarangay ||
      prevValuesRef.current.phLandmark !== currentValues.phLandmark;

    if (hasChanged) {
      prevValuesRef.current = currentValues;
      // Build location string and only update if it's different from last sent
      const locationStr = buildLocationString();
      if (locationStr !== lastSentLocationRef.current) {
        lastSentLocationRef.current = locationStr;
        onChangeRef.current(locationStr);
      }
    }
    // Only depend on selection values, not onChange or data arrays
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode, manualAddress, country, uaeEmirate, uaeCity, uaeDistrict, uaeArea, uaeLandmark, phRegion, phProvince, phCity, phBarangay]);

  const handleCountryChange = (newCountry: 'UAE' | 'Philippines' | '') => {
    setCountry(newCountry);
    setUaeEmirate('');
    setUaeCity('');
    setUaeDistrict('');
    setUaeArea('');
    setUaeLandmark('');
    setPhRegion('');
    setPhProvince('');
    setPhCity('');
    setPhBarangay('');
  };

  useEffect(() => {
    if (presetCountry && presetCountry !== country) {
      handleCountryChange(presetCountry);
    }
  }, [presetCountry]);

  const handleUaeEmirateChange = (emirate: string) => {
    setUaeEmirate(emirate);
    setUaeCity('');
    setUaeDistrict('');
    setUaeArea('');
    setUaeLandmark('');
  };

  const handleUaeCityChange = (city: string) => {
    setUaeCity(city);
    setUaeDistrict('');
    setUaeArea('');
    setUaeLandmark('');
  };

  const handleUaeDistrictChange = (district: string) => {
    setUaeDistrict(district);
    setUaeArea('');
    setUaeLandmark('');
  };

  const handleUaeAreaChange = (area: string) => {
    setUaeArea(area);
    // Don't clear landmark when area changes
  };

  const handleModeChange = (mode: 'dropdown' | 'manual') => {
    setInputMode(mode);
    if (mode === 'manual') {
      // Clear dropdown selections when switching to manual
      setCountry('');
      setUaeEmirate('');
      setUaeCity('');
      setUaeDistrict('');
      setUaeArea('');
      setUaeLandmark('');
      setPhRegion('');
      setPhProvince('');
      setPhCity('');
      setPhBarangay('');
      setPhLandmark('');
    } else {
      // Clear manual address when switching to dropdown
      setManualAddress('');
    }
  };

  return (
    <div className="space-y-4">
      {label && (
        <Label htmlFor={`country-${label}`} className="text-base font-semibold">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
      )}
      
      {!presetCountry && (
        <Card className="border-2 shadow-md bg-gradient-to-br from-background via-muted/30 to-background hover:shadow-lg transition-shadow duration-300">
          <CardContent className="p-4">
            <Tabs value={inputMode} onValueChange={(value) => handleModeChange(value as 'dropdown' | 'manual')} className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-16 bg-muted/60 p-1.5 rounded-lg">
                <TabsTrigger 
                  value="dropdown" 
                  className="flex items-center justify-center gap-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-muted transition-all duration-300 rounded-md font-semibold text-sm group"
                >
                  <Navigation className="h-4 w-4 transition-transform duration-300 group-data-[state=active]:scale-110" />
                  <span>Select from Dropdown</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="manual" 
                  className="flex items-center justify-center gap-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-muted transition-all duration-300 rounded-md font-semibold text-sm group"
                >
                  <Edit3 className="h-4 w-4 transition-transform duration-300 group-data-[state=active]:scale-110" />
                  <span>Enter Manually</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {presetCountry && (
        <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
          Using {presetCountry}
        </div>
      )}

      {/* Manual Input Mode */}
      {inputMode === 'manual' && (
        <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 via-primary/3 to-background transition-all duration-300 hover:border-primary/50 hover:shadow-lg">
          <CardContent className="p-5">
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
                <div className="rounded-full bg-primary/10 p-2.5 shadow-sm">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <span>Enter the complete address manually</span>
              </div>
              <div className="space-y-2.5">
                <Textarea
                  id={`manual-address-${label}`}
                  placeholder="e.g., Building 123, Street 45, Area Name, Dubai, UAE"
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  className="min-h-[120px] text-base resize-none border-2 hover:border-primary/50 focus:border-primary transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-2.5 rounded-md">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-primary flex-shrink-0" />
                  <span>Include street, building, area, city, and country for accurate delivery</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dropdown Selection Mode */}
      {inputMode === 'dropdown' && (
        <div className="space-y-4 transition-all duration-300">
          <Card className="border shadow-sm hover:shadow-lg transition-all duration-200 bg-gradient-to-br from-background via-background to-muted/10">
            <CardContent className="p-5 space-y-5">
              {/* Country Selection */}
              {!presetCountry && (
              <div className="space-y-2.5">
                <Label htmlFor={`country-${label || 'location'}`} className="flex items-center gap-2 text-sm font-semibold">
                  <div className="rounded-md bg-primary/10 p-1.5">
                    <Globe className="h-4 w-4 text-primary" />
                  </div>
                  <span>Country {required && <span className="text-red-500">*</span>}</span>
                </Label>
                <Select
                  value={country}
                  onValueChange={(value) => handleCountryChange(value as 'UAE' | 'Philippines' | '')}
                  required={required}
                >
                  <SelectTrigger id={`country-${label || 'location'}`} className="h-12 text-base border-2 hover:border-primary/50 transition-colors">
                    <SelectValue placeholder="Select Country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UAE" className="text-base py-3">
                      <span className="flex items-center gap-2">
                        <span className="text-xl">🇦🇪</span>
                        <span>UAE - United Arab Emirates</span>
                      </span>
                    </SelectItem>
                    <SelectItem value="Philippines" className="text-base py-3">
                      <span className="flex items-center gap-2">
                        <span className="text-xl">🇵🇭</span>
                        <span>Philippines</span>
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              )}

              {/* UAE Location Hierarchy */}
              {country === 'UAE' && (
                <div className="space-y-4 pt-2">
                  {/* Emirate */}
                  <div className="space-y-2.5 border-l-4 border-primary/30 pl-4">
                    <Label className="flex items-center gap-2 text-sm font-semibold">
                      <div className="rounded-md bg-primary/10 p-1.5">
                        <Navigation className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <span>Emirate {required && <span className="text-red-500">*</span>}</span>
                    </Label>
                    <Select
                      value={uaeEmirate}
                      onValueChange={handleUaeEmirateChange}
                      required={required}
                    >
                      <SelectTrigger className="h-12 text-base border-2 hover:border-primary/50 transition-colors">
                        <SelectValue placeholder="Select Emirate" />
                      </SelectTrigger>
                      <SelectContent>
                        {UAE_EMIRATES.map((emirate) => (
                          <SelectItem key={emirate} value={emirate} className="text-base py-2.5">
                            {emirate}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* City/District */}
                  {uaeEmirate && filteredUAECities.length > 0 && (
                    <div className="space-y-2.5 transition-all duration-300 opacity-100">
                      <Label className="flex items-center gap-2 text-sm font-semibold">
                        <div className="rounded-md bg-blue-100 dark:bg-blue-900/30 p-1.5">
                          <Navigation className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span>City/District {required && <span className="text-red-500">*</span>}</span>
                      </Label>
                      <Select
                        value={uaeCity}
                        onValueChange={handleUaeCityChange}
                        required={required}
                      >
                        <SelectTrigger className="h-12 text-base border-2 hover:border-primary/50 transition-colors">
                          <SelectValue placeholder="Select City/District" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredUAECities.map((city) => (
                            <SelectItem key={city.city_code} value={city.city_code} className="text-base py-2.5">
                              {city.city_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* District */}
                  {uaeCity && filteredUAEDistricts.length > 0 && (
                    <div className="space-y-2.5 transition-all duration-300 opacity-100">
                      <Label className="flex items-center gap-2 text-sm font-semibold">
                        <div className="rounded-md bg-purple-100 dark:bg-purple-900/30 p-1.5">
                          <Navigation className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <span>District {required && <span className="text-red-500">*</span>}</span>
                      </Label>
                      <Select
                        value={uaeDistrict}
                        onValueChange={handleUaeDistrictChange}
                        required={required}
                      >
                        <SelectTrigger className="h-12 text-base border-2 hover:border-primary/50 transition-colors">
                          <SelectValue placeholder="Select District" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredUAEDistricts.map((district) => (
                            <SelectItem key={district.district_code} value={district.district_code} className="text-base py-2.5">
                              {district.district_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Area */}
                  {uaeDistrict && filteredUAEAreas.length > 0 && (
                    <div className="space-y-2.5 transition-all duration-300 opacity-100">
                      <Label className="flex items-center gap-2 text-sm font-semibold">
                        <div className="rounded-md bg-green-100 dark:bg-green-900/30 p-1.5">
                          <Navigation className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                        </div>
                        <span>Area {required && <span className="text-red-500">*</span>}</span>
                      </Label>
                      <Select
                        value={uaeArea}
                        onValueChange={handleUaeAreaChange}
                        required={required}
                      >
                        <SelectTrigger className="h-12 text-base border-2 hover:border-primary/50 transition-colors">
                          <SelectValue placeholder="Select Area" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredUAEAreas.map((area, index) => (
                            <SelectItem key={`${uaeDistrict}-${index}`} value={area} className="text-base py-2.5">
                              {area}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Landmark (Text Input) */}
                  {uaeArea && (
                    <div className="space-y-2.5 pt-3 border-t-2 border-dashed transition-all duration-300">
                      <Label htmlFor={`landmark-${label}`} className="flex items-center gap-2 text-sm font-semibold">
                        <div className="rounded-md bg-orange-100 dark:bg-orange-900/30 p-1.5">
                          <MapPin className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                        </div>
                        <span>Nearest Landmark <span className="text-muted-foreground font-normal">(Optional)</span></span>
                      </Label>
                      <Input
                        id={`landmark-${label}`}
                        type="text"
                        placeholder="e.g., Near Dubai Mall, Opposite Burj Khalifa"
                        value={uaeLandmark}
                        onChange={(e) => setUaeLandmark(e.target.value)}
                        className="h-12 text-base border-2 hover:border-primary/50 focus:border-primary transition-colors"
                      />
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 pl-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        <span>Enter a nearby landmark to help with delivery</span>
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Philippines Location Hierarchy */}
              {country === 'Philippines' && (
                <div className="space-y-4 pt-2">
                  {/* Region */}
                  <div className="space-y-2.5 border-l-4 border-primary/30 pl-4">
                    <Label className="flex items-center gap-2 text-sm font-semibold">
                      <div className="rounded-md bg-primary/10 p-1.5">
                        <Navigation className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <span>Region {required && <span className="text-red-500">*</span>}</span>
                    </Label>
                    <Select
                      value={phRegion}
                      onValueChange={setPhRegion}
                      required={required}
                    >
                      <SelectTrigger className="h-12 text-base border-2 hover:border-primary/50 transition-colors">
                        <SelectValue placeholder="Select Region" />
                      </SelectTrigger>
                      <SelectContent>
                        {regions.map((region) => (
                          <SelectItem key={region.region_code} value={region.region_code} className="text-base py-2.5">
                            {region.region_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Province */}
                  {phRegion && (
                    <div className="space-y-2.5 transition-all duration-300 opacity-100">
                      <Label className="flex items-center gap-2 text-sm font-semibold">
                        <div className="rounded-md bg-blue-100 dark:bg-blue-900/30 p-1.5">
                          <Navigation className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span>Province {required && <span className="text-red-500">*</span>}</span>
                      </Label>
                      <Select
                        value={phProvince}
                        onValueChange={setPhProvince}
                        required={required}
                      >
                        <SelectTrigger className="h-12 text-base border-2 hover:border-primary/50 transition-colors">
                          <SelectValue placeholder="Select Province" />
                        </SelectTrigger>
                        <SelectContent>
                          {provinces
                            .filter((p) => p.region_code === phRegion)
                            .map((province) => (
                              <SelectItem key={province.province_code} value={province.province_code} className="text-base py-2.5">
                                {province.province_name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* City */}
                  {phProvince && (
                    <div className="space-y-2.5 transition-all duration-300 opacity-100">
                      <Label className="flex items-center gap-2 text-sm font-semibold">
                        <div className="rounded-md bg-purple-100 dark:bg-purple-900/30 p-1.5">
                          <Navigation className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <span>City {required && <span className="text-red-500">*</span>}</span>
                      </Label>
                      <Select
                        value={phCity}
                        onValueChange={setPhCity}
                        required={required}
                      >
                        <SelectTrigger className="h-12 text-base border-2 hover:border-primary/50 transition-colors">
                          <SelectValue placeholder="Select City" />
                        </SelectTrigger>
                        <SelectContent>
                          {cities
                            .filter((c) => c.province_code === phProvince)
                            .map((city) => (
                              <SelectItem key={city.city_code} value={city.city_code} className="text-base py-2.5">
                                {city.city_name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Barangay */}
                  {phCity && barangays.length > 0 && (
                    <div className="space-y-2.5 transition-all duration-300 opacity-100">
                      <Label className="flex items-center gap-2 text-sm font-semibold">
                        <div className="rounded-md bg-green-100 dark:bg-green-900/30 p-1.5">
                          <Navigation className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                        </div>
                        <span>Barangay <span className="text-muted-foreground font-normal">(Optional)</span></span>
                      </Label>
                      <Select
                        value={phBarangay}
                        onValueChange={setPhBarangay}
                      >
                        <SelectTrigger className="h-12 text-base border-2 hover:border-primary/50 transition-colors">
                          <SelectValue placeholder="Select Barangay" />
                        </SelectTrigger>
                        <SelectContent>
                          {barangays.map((barangay) => (
                            <SelectItem key={barangay.brgy_code} value={barangay.brgy_code} className="text-base py-2.5">
                              {barangay.brgy_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
              {country === 'Philippines' && phProvince && phCity && (
                <div className="space-y-2.5 pt-3 border-t-2 border-dashed transition-all duration-300">
                  <Label htmlFor={`ph-landmark-${label}`} className="flex items-center gap-2 text-sm font-semibold">
                    <div className="rounded-md bg-orange-100 dark:bg-orange-900/30 p-1.5">
                      <MapPin className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <span>Nearest Landmark <span className="text-muted-foreground font-normal">(Optional)</span></span>
                  </Label>
                  <Input
                    id={`ph-landmark-${label}`}
                    type="text"
                    placeholder="e.g., Near SM Mall, Beside City Hall"
                    value={phLandmark}
                    onChange={(e) => setPhLandmark(e.target.value)}
                    className="h-12 text-base border-2 hover:border-primary/50 focus:border-primary transition-colors"
                  />
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 pl-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    <span>Add a landmark to help the courier find the location faster</span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

