// App.js
import * as React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, SafeAreaView, Platform, StatusBar, StyleSheet } from "react-native";
import AadharScanner from "./AadharScanner";
import SavedRecords from "./SavedRecords";

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false, // hide top header bar
            tabBarIconStyle: { display: "none" }, // hide default icons
            tabBarLabel: ({ focused }) => (
              <Text
                style={{
                  color: focused ? "#007AFF" : "#777",
                  fontSize: 14,
                  fontWeight: focused ? "700" : "500",
                  marginBottom: Platform.OS === "android" ? 8 : 5,
                }}
              >
                {route.name}
              </Text>
            ),
            tabBarStyle: {
              backgroundColor: "#ffffff",
              borderTopWidth: 0.5,
              borderTopColor: "#ccc",
              elevation: 8,
              height: 100,
              paddingBottom: Platform.OS === "android" ? 8 : 4,
            },
          })}
        >
          <Tab.Screen name="Scan" component={AadharScanner} />
          <Tab.Screen name="Records" component={SavedRecords} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
});
