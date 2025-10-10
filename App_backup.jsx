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
import FileViewer from "react-native-file-viewer";

// ---------------------- DATABASE ----------------------
const DB_NAME = "AadharDB.db";

// Open database once
const db = SQLite.openDatabase(
  { name: DB_NAME, location: "default" },
  () => console.log("✅ Database opened successfully"),
  (err) => console.error("❌ Database open error:", err)
);

// Helper to get DB path safely
function getDatabasePath() {
  if (Platform.OS === "android") {
    return `/data/data/com.datascanner/databases/${DB_NAME}`;
  } else {
    return `${RNFS.DocumentDirectoryPath}/${DB_NAME}`;
  }
}

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
      () => {
        console.log("✅ Table ready");
        ToastAndroid.show("✅ Database & Table ready", ToastAndroid.SHORT);
      },
      (tx, err) => console.error("❌ Table creation error:", err)
    );
  });
}

// ---------------------- PERMISSIONS ----------------------
async function requestAllPermissions() {
  if (Platform.OS !== "android") return true;

  const camera = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
    {
      title: "Camera Permission",
      message: "App needs access to the camera to scan Aadhaar cards.",
      buttonPositive: "OK",
    }
  );

  let storage;
  if (Platform.Version >= 33) {
    storage = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
    );
  } else {
    storage = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
    );
  }

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

// ---------------------- OCR PARSER ----------------------
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

  const aadhaarMatch = fullText.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
  if (aadhaarMatch) result.aadhaar_number = aadhaarMatch[0].replace(/\s/g, "");

  const dobMatch = fullText.match(/\b\d{2}[\/-]\d{2}[\/-]\d{4}\b/);
  if (dobMatch) result.dob = dobMatch[0];

  if (/male/i.test(fullText)) result.gender = "Male";
  else if (/female/i.test(fullText)) result.gender = "Female";

  const mobileMatch = fullText.match(/\b[6-9]\d{9}\b/);
  if (mobileMatch) result.mobile = mobileMatch[0];

  const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (/name/i.test(lines[i])) continue;
    if (/[A-Za-z]/.test(lines[i]) && lines[i].split(" ").length >= 2) {
      result.name = lines[i];
      break;
    }
  }

  const addrIndex = lines.findIndex((l) => /address/i.test(l));
  if (addrIndex !== -1 && lines[addrIndex + 1]) {
    result.address = lines.slice(addrIndex + 1, addrIndex + 4).join(", ");
  }

  return result;
}

// ---------------------- MAIN COMPONENT ----------------------
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

  useEffect(() => {
    initDatabase();
    requestAllPermissions();
    fetchRecords();
  }, []);

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
    if (res.errorCode)
      return Alert.alert("Camera Error", res.errorMessage || "Unknown error");

    const asset = res.assets?.[0];
    if (asset?.uri) await processImage(asset.uri);
  }

  async function handlePickImage() {
    const allowed = await requestAllPermissions();
    if (!allowed) return;

    const res = await launchImageLibrary({ mediaType: "photo", quality: 0.8 });
    if (res.didCancel) return;
    if (res.errorCode)
      return Alert.alert("Picker Error", res.errorMessage || "Unknown error");

    const asset = res.assets?.[0];
    if (asset?.uri) await processImage(asset.uri);
  }

  function saveToDB() {
    const { name, aadhaar_number, dob, address, gender, mobile } = form;
    if (!aadhaar_number) {
      return ToastAndroid.show("⚠️ Aadhaar number required!", ToastAndroid.SHORT);
    }

    db.transaction((tx) => {
      tx.executeSql(
        `INSERT OR REPLACE INTO AadharData
        (id, name, aadhaar_number, dob, address, gender, mobile, scanned_at)
        VALUES
        ((SELECT id FROM AadharData WHERE aadhaar_number = ?), ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [aadhaar_number, name, aadhaar_number, dob, address, gender, mobile],
        () => {
          ToastAndroid.show("✅ Data saved successfully!", ToastAndroid.SHORT);
          fetchRecords();
        },
        (tx, err) => {
          console.error("DB insert error:", err);
          ToastAndroid.show("❌ Failed to save data", ToastAndroid.SHORT);
        }
      );
    });
  }

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
        },
        (tx, err) => console.error("DB fetch error:", err)
      );
    });
  }

  // ---------------------- OPEN DATABASE FILE ----------------------
  async function openDatabaseFile() {
    try {
      const dbPath = getDatabasePath();

      const exists = await RNFS.exists(dbPath);
      if (!exists) {
        Alert.alert("Not Found", `Database file not found at ${dbPath}`);
        return;
      }

      const destPath = `${RNFS.DownloadDirectoryPath}/${DB_NAME}`;
      await RNFS.copyFile(dbPath, destPath);

      await FileViewer.open(destPath);
      ToastAndroid.show(`Database copied to Downloads: ${DB_NAME}`, ToastAndroid.LONG);
    } catch (err) {
      console.error("Open DB error:", err);
      Alert.alert("Error", "Cannot open database file. Check permissions.");
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* <ScrollView contentContainerStyle={styles.container}> */}
        <Text style={styles.heading}>✏️ Edit Extracted Aadhaar Details:</Text>

        {[
          { key: "aadhaar_number", label: "Aadhaar Number" },
          { key: "name", label: "Name" },
          { key: "dob", label: "Date of Birth" },
          { key: "address", label: "Address" },
          { key: "gender", label: "Gender" },
          { key: "mobile", label: "Mobile Number" },
        ].map((f) => (
          <View key={f.key} style={{ marginTop: 10 }}>
            <Text>{f.label}</Text>
            <TextInput
              style={styles.input}
              value={form[f.key]}
              onChangeText={(t) => setForm({ ...form, [f.key]: t })}
              placeholder={`Enter ${f.label}`}
            />
          </View>
        ))}

        <View style={styles.buttonGroup}>
          <Button title="📷 Capture Aadhaar" onPress={handleCapture} />
          <View style={{ height: 10 }} />
          <Button title="🖼 Pick Aadhaar Image" onPress={handlePickImage} />
          <View style={{ height: 10 }} />
          <Button title="💾 Save Data" onPress={saveToDB} />
          <View style={{ height: 10 }} />
          <Button title="📂 Open Database File" onPress={openDatabaseFile} />
        </View>

        <Text style={[styles.heading, { marginTop: 20 }]}>📄 Saved Records:</Text>
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
                <Text>Address: {item.address}</Text>
                <Text>Gender: {item.gender}</Text>
                <Text>Mobile: {item.mobile}</Text>
                <Text style={{ fontSize: 10, color: "#555" }}>
                  Scanned At: {item.scanned_at}
                </Text>
              </View>
            )}
          />
        )}
      {/* </ScrollView> */}
    </SafeAreaView>
  );
}

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
  heading: { fontWeight: "bold", fontSize: 16, marginBottom: 10 },
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
});
