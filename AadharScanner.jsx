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
import DatePicker from 'react-native-date-picker'
import { launchCamera, launchImageLibrary } from "react-native-image-picker";
import TextRecognition from "@react-native-ml-kit/text-recognition";
import SQLite from "react-native-sqlite-storage";

// =====================================================
// 🔹 DATABASE CONFIGURATION
// =====================================================
const DB_NAME = "AadharDB.db";
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
// 🔹 TIMEZONE HELPER (Indian Time)
// =====================================================
function getIndianTimestamp() {
  const now = new Date();
  const options = {
    timeZone: "Asia/Kolkata",
    hour12: true,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  };
  return new Intl.DateTimeFormat("en-IN", options).format(now);
}

// =====================================================
// 🔹 PERMISSIONS HANDLER
// =====================================================
async function requestAllPermissions() {
  if (Platform.OS !== "android") return true;

  const camera = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA
  );
  const storage =
    Platform.Version >= 33
      ? await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
        )
      : await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
        );

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
// 🔹 OCR PARSER WITH ADDRESS LOGIC
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
    const yearMatch = dobLine.match(/\b\d{4}\b/);
    if (dobMatch) result.dob = dobMatch[0];
    else if (yearMatch) result.dob = yearMatch[0];
  }

  // Gender
  if (/male/i.test(cleanText)) result.gender = "Male";
  else if (/female/i.test(cleanText)) result.gender = "Female";

  // Mobile
  const mobileMatch = cleanText.match(/\b[6-9]\d{9}\b/);
  if (mobileMatch) result.mobile = mobileMatch[0];

  // Name
  for (let line of lines) {
    if (
      /^[A-Za-z ]+$/.test(line) &&
      !/DOB|Year|Gender|Address|Father|Mother|Wife|Husband/i.test(line)
    ) {
      result.name = line.trim();
      break;
    }
  }

  // Address
  const addressIndex = lines.findIndex((l) => /address/i.test(l));
  if (addressIndex !== -1) {
    const addressLines = lines
      .slice(addressIndex + 1, addressIndex + 6)
      .filter((line) => !/(www\.|http|help|mailto)/i.test(line));
    result.address = addressLines.join(", ").trim();
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
    scanned_at: "",
  });
  const [records, setRecords] = useState([]);
  const [date, setDate] = useState(new Date())
  const [open, setOpen] = useState(false);
  useEffect(() => {
    initDatabase();
    requestAllPermissions();
    fetchRecords();
  }, []);

  // ------------------ OCR IMAGE PROCESSOR ------------------
  async function processImage(uri, type) {
    try {
      const ocrResult = await TextRecognition.recognize(uri);
      const extractedText = ocrResult?.text || "";
      const parsed = parseAadhaarText(extractedText);

      if (type === "front") setForm((prev) => ({ ...prev, ...parsed }));
      else if (type === "back") setForm((prev) => ({ ...prev, address: parsed.address }));
    } catch (err) {
      console.error("OCR error:", err);
      Alert.alert("Error", "Failed to extract Aadhaar details.");
    }
  }

  // ------------------ CAPTURE FRONT & BACK ------------------
  async function captureAadhaar() {
    const allowed = await requestAllPermissions();
    if (!allowed) return;

    const frontRes = await launchCamera({ mediaType: "photo", quality: 0.8 });
    if (frontRes.didCancel || !frontRes.assets?.[0]?.uri) return;
    await processImage(frontRes.assets[0].uri, "front");

    const backRes = await launchCamera({ mediaType: "photo", quality: 0.8 });
    if (backRes.didCancel || !backRes.assets?.[0]?.uri) return;
    await processImage(backRes.assets[0].uri, "back");

    const scannedAt = getIndianTimestamp();
    setForm((prev) => ({ ...prev, scanned_at: scannedAt }));

    ToastAndroid.show("✅ Aadhaar captured!", ToastAndroid.SHORT);
  }

  // ------------------ PICK 2 IMAGES ------------------
  async function pickAadhaarImages() {
    const allowed = await requestAllPermissions();
    if (!allowed) return;

    const res = await launchImageLibrary({
      mediaType: "photo",
      selectionLimit: 2,
    });

    if (!res.assets || res.assets.length === 0) return;

    if (res.assets[0]?.uri) await processImage(res.assets[0].uri, "front");
    if (res.assets[1]?.uri) await processImage(res.assets[1].uri, "back");

    const scannedAt = getIndianTimestamp();
    setForm((prev) => ({ ...prev, scanned_at: scannedAt }));

    ToastAndroid.show("✅ Aadhaar images processed!", ToastAndroid.SHORT);
  }

  // ------------------ VALIDATIONS ------------------
  function validateInputs() {
    const { name, aadhaar_number, address, mobile } = form;
    if (!name.trim()) return "Name is required!";
    if (!aadhaar_number.match(/^\d{12}$/)) return "Aadhaar number must be 12 digits!";
    if (!address.trim()) return "Address is required!";
    if (!mobile.match(/^[6-9]\d{9}$/)) return "Valid Mobile number is required!";
    return null;
  }

  // ------------------ SAVE TO DB ------------------
  function saveToDB() {
    const validationError = validateInputs();
    if (validationError) {
      ToastAndroid.show(`⚠️ ${validationError}`, ToastAndroid.SHORT);
      return;
    }

    const { name, aadhaar_number, dob, address, gender, mobile, scanned_at } = form;

    db.transaction((tx) => {
      tx.executeSql(
        `INSERT OR REPLACE INTO AadharData
          (id, name, aadhaar_number, dob, address, gender, mobile, scanned_at)
         VALUES ((SELECT id FROM AadharData WHERE aadhaar_number = ?), ?, ?, ?, ?, ?, ?, ?)`,
        [aadhaar_number, name, aadhaar_number, dob, address, gender, mobile, scanned_at],
        () => {
          ToastAndroid.show("✅ Data saved!", ToastAndroid.SHORT);
          fetchRecords();
          setForm({
            aadhaar_number: "",
            name: "",
            dob: "",
            address: "",
            gender: "",
            mobile: "",
            scanned_at: "",
          });
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
        `SELECT * FROM AadharData ORDER BY id DESC`,
        [],
        (tx, results) => {
          const temp = [];
          for (let i = 0; i < results.rows.length; i++) temp.push(results.rows.item(i));
          setRecords(temp);
        }
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
          { key: "name", label: "Name *" },
          { key: "aadhaar_number", label: "Aadhaar Number *" },
          { key: "dob", label: "Date of Birth" },
          { key: "gender", label: "Gender" },
          { key: "mobile", label: "Mobile Number *" },
          { key: "address", label: "Address *" },
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

        {form.scanned_at ? (
          <Text style={{ marginTop: 8, color: "gray" }}>
            🕒 Scanned At: {form.scanned_at}
          </Text>
        ) : null}

        {/* BUTTONS */}
        <View style={styles.buttonGroup}>
          <Button title="📷 Capture Aadhaar" onPress={captureAadhaar} />
          <View style={{ height: 10 }} />
          <Button title="📁 Pick Aadhaar Images" onPress={pickAadhaarImages} />
          <View style={{ height: 10 }} />
          <Button title="💾 Save Data" onPress={saveToDB} />
        </View>
            {/* <Button title="Open" onPress={() => setOpen(true)} />
        <DatePicker
        modal
        open={open}
        date={date}
        onConfirm={(date) => {
          setOpen(false)
          setDate(date)
        }}
        onCancel={() => {
          setOpen(false)
        }}
      />
      <Text>{JSON.stringify(date)}</Text> */}
      </ScrollView>
    </SafeAreaView>
  );
}

// =====================================================
// 🔹 STYLES
// =====================================================
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f9f9f9", paddingTop: Platform.OS === "android" ? 30 : 0 },
  container: { padding: 20, paddingBottom: 80 },
  heading: { fontWeight: "bold", fontSize: 16, marginBottom: 10 },
  fieldGroup: { marginTop: 10 },
  input: { borderWidth: 1, borderColor: "#999", borderRadius: 8, padding: 12, marginTop: 5, backgroundColor: "#fff" },
  buttonGroup: { marginTop: 20, marginBottom: 20 },
  record: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, marginTop: 10, backgroundColor: "#fff" },
});
