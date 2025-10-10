// App.js
import * as React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";
import AadharScanner from "./AadharScanner";
import SavedRecords from "./SavedRecords";

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false, // hide top header bar
          tabBarIconStyle: { display: "none" }, // ✅ completely hide default icons
          tabBarLabel: ({ focused }) => (
            <Text
              style={{
                color: focused ? "#007AFF" : "#777",
                fontSize: 14,
                fontWeight: focused ? "700" : "500",
                marginBottom: 5,
              }}
            >
              {route.name}
            </Text>
          ),
          tabBarStyle: {
            backgroundColor: "#ffffff",
            borderTopWidth: 0.5,
            borderTopColor: "#ccc",
            elevation: 6,
            height: 60,
          },
        })}
      >
        <Tab.Screen name="Scan" component={AadharScanner} />
        <Tab.Screen name="Records" component={SavedRecords} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
