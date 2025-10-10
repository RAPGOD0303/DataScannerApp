import React, { useState, useEffect } from "react";
import {
  View,
  Button,
  Text,
  TextInput,
  Alert,
  PermissionsAndroid,
  Platform,
  Linking,
  ScrollView,
  ToastAndroid,
  FlatList,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { launchCamera, launchImageLibrary } from "react-native-image-picker";
import RNFS from "react-native-fs";
import TextRecognition from "@react-native-ml-kit/text-recognition";
import SQLite from "react-native-sqlite-storage";

// =====================================================
// 🔹 DATABASE CONFIGURATION
// =====================================================
const DB_NAME = "AadharDB.db";
const DB_PATH = `${RNFS.DocumentDirectoryPath}/${DB_NAME}`;
const db = SQLite.openDatabase(
  { name: DB_NAME, location: "default" },
  () => console.log("✅ Database opened successfully"),
  (err) => console.error("❌ Database open error:", err)
);

function initDatabase() {
  db.transaction((tx) => {
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS AadharData (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        aadhaar_number TEXT UNIQUE,
        dob TEXT,
        address TEXT,
        gender TEXT,
        mobile TEXT,
        scanned_at TEXT
      );`,
      [],
      () => console.log("✅ Table ready"),
      (tx, err) => console.error("❌ Table creation error:", err)
    );
  });
}

// =====================================================
// 🔹 PERMISSIONS HANDLER
// =====================================================
async function requestAllPermissions() {
  if (Platform.OS !== "android") return true;

  const camera = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
  const storage =
    Platform.Version >= 33
      ? await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES)
      : await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);

  if (
    camera !== PermissionsAndroid.RESULTS.GRANTED ||
    storage !== PermissionsAndroid.RESULTS.GRANTED
  ) {
    Alert.alert(
      "Permissions Required",
      "Camera and Storage permissions are needed.",
      [{ text: "Open Settings", onPress: () => Linking.openSettings() }]
    );
    return false;
  }

  return true;
}

// =====================================================
// 🔹 OCR PARSER
// =====================================================
function parseAadhaarText(fullText) {
  const result = {
    aadhaar_number: "",
    name: "",
    dob: "",
    address: "",
    gender: "",
    mobile: "",
  };

  if (!fullText) return result;

  let cleanText = fullText
    .replace(/government of india/gi, "")
    .replace(/unique identification authority/gi, "")
    .replace(/भारत सरकार/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const lines = cleanText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !/gov/i.test(l) &&
        !/authority/i.test(l) &&
        !/aadhaar/i.test(l) &&
        !/भारत/i.test(l)
    );

  // Aadhaar number
  const aadhaarMatch = cleanText.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
  if (aadhaarMatch) result.aadhaar_number = aadhaarMatch[0].replace(/\s/g, "");

  // DOB
  const dobLine = lines.find((l) => /DOB|Date of Birth/i.test(l));
  if (dobLine) {
    const dobMatch = dobLine.match(/\d{2}[\/-]\d{2}[\/-]\d{4}/);
    if (dobMatch) result.dob = dobMatch[0];
  }

  // Gender
  if (/male/i.test(cleanText)) result.gender = "Male";
  else if (/female/i.test(cleanText)) result.gender = "Female";

  // Mobile number
  const mobileMatch = cleanText.match(/\b[6-9]\d{9}\b/);
  if (mobileMatch) result.mobile = mobileMatch[0];

  // Name: first line with alphabets, not containing keywords
  for (let line of lines) {
    if (/^[A-Za-z ]+$/.test(line) && !/DOB|Year|Gender|Address|Father|Mother|Wife|Husband/i.test(line)) {
      result.name = line.trim();
      break;
    }
  }

  return result;
}

// =====================================================
// 🔹 MAIN COMPONENT
// =====================================================
export default function AadharScanner() {
  const [form, setForm] = useState({
    aadhaar_number: "",
    name: "",
    dob: "",
    address: "",
    gender: "",
    mobile: "",
  });
  const [records, setRecords] = useState([]);
  const [recentRecords, setRecentRecords] = useState([]);

  useEffect(() => {
    initDatabase();
    requestAllPermissions();
    fetchRecords();
  }, []);

  // ------------------ OCR IMAGE PROCESSOR ------------------
  async function processImage(uri) {
    try {
      const ocrResult = await TextRecognition.recognize(uri);
      const extractedText = ocrResult?.text || "";
      const parsed = parseAadhaarText(extractedText);
      setForm(parsed);
    } catch (err) {
      console.error("OCR error:", err);
      Alert.alert("Error", "Failed to extract Aadhaar details.");
    }
  }

  async function handleCapture() {
    const allowed = await requestAllPermissions();
    if (!allowed) return;

    const res = await launchCamera({ mediaType: "photo", quality: 0.8 });
    if (res.didCancel) return;
    if (res.errorCode) return Alert.alert("Camera Error", res.errorMessage || "Unknown error");

    const asset = res.assets?.[0];
    if (asset?.uri) await processImage(asset.uri);
  }

  async function handlePickImage() {
    const allowed = await requestAllPermissions();
    if (!allowed) return;

    const res = await launchImageLibrary({ mediaType: "photo", quality: 0.8 });
    if (res.didCancel) return;
    if (res.errorCode) return Alert.alert("Picker Error", res.errorMessage || "Unknown error");

    const asset = res.assets?.[0];
    if (asset?.uri) await processImage(asset.uri);
  }

  // ------------------ SAVE OR UPDATE RECORD ------------------
  function saveToDB() {
    const { name, aadhaar_number, dob, address, gender, mobile } = form;

    if (!name || !aadhaar_number) {
      return ToastAndroid.show("⚠️ Aadhaar number and Name required!", ToastAndroid.SHORT);
    }

    db.transaction((tx) => {
      tx.executeSql(
        `INSERT OR REPLACE INTO AadharData 
        (id, name, aadhaar_number, dob, address, gender, mobile, scanned_at)
        VALUES (
          (SELECT id FROM AadharData WHERE aadhaar_number = ?),
          ?, ?, ?, ?, ?, ?, datetime('now')
        )`,
        [aadhaar_number, name, aadhaar_number, dob, address, gender, mobile],
        () => {
          ToastAndroid.show("✅ Data saved!", ToastAndroid.SHORT);
          fetchRecords();
        },
        (tx, err) => {
          console.error("DB insert error:", err);
          ToastAndroid.show("❌ Failed to save data", ToastAndroid.SHORT);
        }
      );
    });
  }

  // ------------------ FETCH RECORDS ------------------
  function fetchRecords() {
    db.transaction((tx) => {
      tx.executeSql(
        `SELECT * FROM AadharData ORDER BY scanned_at DESC`,
        [],
        (tx, results) => {
          const temp = [];
          for (let i = 0; i < results.rows.length; i++) {
            temp.push(results.rows.item(i));
          }
          setRecords(temp);
          setRecentRecords(temp.slice(0, 3)); // last 3 recently added
        },
        (tx, err) => console.error("DB fetch error:", err)
      );
    });
  }

  // =====================================================
  // 🔹 UI
  // =====================================================
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>✏️ Aadhaar Details (Editable)</Text>
        {[
          { key: "aadhaar_number", label: "Aadhaar Number" },
          { key: "name", label: "Name" },
          { key: "dob", label: "Date of Birth" },
          { key: "gender", label: "Gender" },
          { key: "mobile", label: "Mobile Number" },
          { key: "address", label: "Address" },
        ].map((f) => (
          <View key={f.key} style={styles.fieldGroup}>
            <Text>{f.label}</Text>
            <TextInput
              style={styles.input}
              value={form[f.key]}
              onChangeText={(t) => setForm({ ...form, [f.key]: t })}
              placeholder={`Enter ${f.label}`}
            />
          </View>
        ))}

        {/* BUTTONS */}
        <View style={styles.buttonGroup}>
          <Button title="📷 Capture Aadhaar" onPress={handleCapture} />
          <View style={{ height: 10 }} />
          <Button title="🖼 Pick Aadhaar Image" onPress={handlePickImage} />
          <View style={{ height: 10 }} />
          <Button title="💾 Save Data" onPress={saveToDB} />
        </View>

        {/* RECENTLY ADDED SECTION */}
        <Text style={[styles.heading, { marginTop: 20 }]}>🕒 Recently Added</Text>
        {recentRecords.length === 0 ? (
          <Text>No recent records.</Text>
        ) : (
          <FlatList
            data={recentRecords}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <View style={styles.record}>
                <Text>Name: {item.name}</Text>
                <Text>Aadhaar: {item.aadhaar_number}</Text>
                <Text>DOB: {item.dob}</Text>
                <Text>Gender: {item.gender}</Text>
                <Text>Mobile: {item.mobile}</Text>
              </View>
            )}
          />
        )}

        {/* SAVED RECORDS */}
        <Text style={[styles.heading, { marginTop: 20 }]}>📄 All Saved Records</Text>
        {records.length === 0 ? (
          <Text>No records yet.</Text>
        ) : (
          <FlatList
            data={records}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <View style={styles.record}>
                <Text>Aadhaar: {item.aadhaar_number}</Text>
                <Text>Name: {item.name}</Text>
                <Text>DOB: {item.dob}</Text>
                <Text>Gender: {item.gender}</Text>
                <Text>Mobile: {item.mobile}</Text>
                {item.address ? <Text>Address: {item.address}</Text> : null}
                <Text style={styles.timestamp}>Scanned At: {item.scanned_at}</Text>
              </View>
            )}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// =====================================================
// 🔹 STYLES
// =====================================================
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f9f9f9",
    paddingTop: Platform.OS === "android" ? 30 : 0,
  },
  container: {
    padding: 20,
    paddingBottom: 80,
  },
  heading: {
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 10,
  },
  fieldGroup: {
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#999",
    borderRadius: 8,
    padding: 12,
    marginTop: 5,
    backgroundColor: "#fff",
  },
  buttonGroup: {
    marginTop: 20,
    marginBottom: 20,
  },
  record: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    backgroundColor: "#fff",
  },
  timestamp: {
    fontSize: 10,
    color: "#555",
    marginTop: 4,
  },
});
