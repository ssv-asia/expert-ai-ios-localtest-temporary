// Expo Router custom entry point. The widget headless task must be registered
// from the actual bundle entry; importing expo-router/entry as a side effect
// can start the application before the headless task is registered.
import '@expo/metro-runtime';
import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './widgets/widget-task-handler';

// The widget native module exists only on Android.
if (Platform.OS === 'android') {
  registerWidgetTaskHandler(widgetTaskHandler);
}
renderRootComponent(App);
