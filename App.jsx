// App.js
import * as React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import AadharScanner from "./AadharScanner";
import SavedRecords from "./SavedRecords";

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen name="Scan" component={AadharScanner} />
        <Tab.Screen name="Records" component={SavedRecords} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
