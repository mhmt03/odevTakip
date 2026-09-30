import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { School, getActiveSchool } from '../database/operations/schoolOperations';
import { Colors } from '../theme/colors';

interface SchoolThemeContextType {
  activeSchool: School | null;
  themeColor: string;
  bgTint: string;
  reloadSchoolTheme: () => Promise<void>;
}

const SchoolThemeContext = createContext<SchoolThemeContextType>({
  activeSchool: null,
  themeColor: Colors.primary,
  bgTint: Colors.background,
  reloadSchoolTheme: async () => {},
});

export const SchoolThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSchool, setActiveSchool] = useState<School | null>(null);

  const reloadSchoolTheme = useCallback(async () => {
    try {
      const active = await getActiveSchool();
      setActiveSchool(active);
    } catch (e) {
      console.warn('Error loading active school theme:', e);
    }
  }, []);

  useEffect(() => {
    reloadSchoolTheme();
  }, [reloadSchoolTheme]);

  const themeColor = activeSchool?.color || Colors.primary;
  const bgTint = activeSchool?.color ? `${activeSchool.color}0E` : Colors.background;

  return (
    <SchoolThemeContext.Provider
      value={{
        activeSchool,
        themeColor,
        bgTint,
        reloadSchoolTheme,
      }}
    >
      {children}
    </SchoolThemeContext.Provider>
  );
};

export const useSchoolTheme = () => useContext(SchoolThemeContext);
