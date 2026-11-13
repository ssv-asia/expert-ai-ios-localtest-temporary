import { Platform, StyleSheet, View, type ViewStyle, type StyleProp } from "react-native";

import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

interface SelectProps<T extends string = string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Select<T extends string = string>({
  value,
  options,
  onChange,
  placeholder,
  disabled,
  style,
}: SelectProps<T>) {
  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";

  const textColor = isDark ? "#fefdfd" : "#1A1A1A";
  const bg = isDark ? "#111" : "#F8F8F8";
  const border = isDark ? "#333" : "#E0E0E0";
  const mutedColor = isDark ? "#888" : "#999";

  if (Platform.OS === "web") {
    return (
      <View style={[styles.wrapper, style]}>
        <select
          value={value}
          disabled={disabled}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            onChange(e.target.value as T)
          }
          style={{
            width: "100%",
            fontFamily: Fonts.sans,
            fontSize: 13,
            color: value ? textColor : mutedColor,
            backgroundColor: bg,
            border: `0.633px solid ${border}`,
            borderRadius: 6,
            paddingLeft: 10,
            paddingRight: 10,
            paddingTop: 8,
            paddingBottom: 8,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.5 : 1,
          } as React.CSSProperties}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, style]}>
      <View
        style={[
          styles.nativeTrigger,
          { backgroundColor: bg, borderColor: border },
          disabled && styles.disabled,
        ]}
      >
        {/* Native mobile: use Picker from @react-native-picker/picker if needed */}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
  },
  nativeTrigger: {
    borderWidth: 0.633,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  disabled: {
    opacity: 0.5,
  },
});
