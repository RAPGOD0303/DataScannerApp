// // App.js
// import * as React from "react";
// import { NavigationContainer } from "@react-navigation/native";
// import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
// import { Text, SafeAreaView, Platform, StatusBar, StyleSheet,View } from "react-native";
// import AadharScanner from "./AadharScanner";
// import SavedRecords from "./SavedRecords";

// const Tab = createBottomTabNavigator();

// export default function App() {
//   return (
//     // <SafeAreaView style={styles.safeArea}>
//     <View style={styles.safeArea}>
//       <StatusBar barStyle="dark-content" backgroundColor="#fff" />
//       <NavigationContainer>
//         <Tab.Navigator
//           screenOptions={({ route }) => ({
//             headerShown: false, // hide top header bar
//             tabBarIconStyle: { display: "none" }, // hide default icons
//             tabBarLabel: ({ focused }) => (
//               <Text
//                 style={{
//                   color: focused ? "#007AFF" : "#777",
//                   fontSize: 14,
//                   fontWeight: focused ? "700" : "500",
//                                 padding:10,

//                   marginBottom: Platform.OS === "android" ? 8 : 5,
//                 }}
//               >
//                 {route.name}
//               </Text>
//             ),
//             tabBarStyle: {
//               backgroundColor: "#ffffffff",
//               borderTopWidth: 0.5,
//               borderTopColor: "#ccc",
//               elevation: 8,
//               display:"flex",
//               padding:50,
//               textAlign:"center",
//               alignItem:"center",
//               justifyContent:"center",
//               height: 70,
//               paddingBottom: Platform.OS === "android" ? 8 : 4,
//             },
//           })}
//         >
//           <Tab.Screen name="Scan" component={AadharScanner} />
//           <Tab.Screen name="Records" component={SavedRecords} />
//         </Tab.Navigator>
//       </NavigationContainer>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   safeArea: {
//     flex: 1,
//     backgroundColor: "#fff",
//     paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
//   },
// });
// App.js

import * as React from 'react';
import { Text, View, Platform, StatusBar, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import AadharScanner from './AadharScanner';
import SavedRecords from './SavedRecords';
const Tab = createBottomTabNavigator();
function MyTabs() {
  const insets = useSafeAreaInsets(); // ✅ get safe area padding
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIconStyle: { display: 'none' },
        tabBarLabel: ({ focused }) => (
          <Text
            style={{
              color: focused ? '#007AFF' : '#777',
              fontSize: 14,
              fontWeight: focused ? '700' : '500',
              padding: 10,
              marginBottom: Platform.OS === 'android' ? 8 : 5,
            }}
          >
            {route.name}
          </Text>
        ),
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 0.5,
          borderTopColor: '#ccc',
          elevation: 8,
          display: 'flex',
          textAlign: 'center',
          alignItems: 'center',
          justifyContent: 'center',
          // ✅ dynamically adjust for safe area / gesture nav
          height: 65 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : Platform.OS === 'android' ? 8 : 4,
        },
      })}
    >
      <Tab.Screen name="Scan" component={AadharScanner} />
      <Tab.Screen name="Records" component={SavedRecords} />
    </Tab.Navigator>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <View style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <NavigationContainer>
          <MyTabs />
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
});

 