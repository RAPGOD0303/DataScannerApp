import React, { useState, useEffect, useRef, useCallback } from "react";
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
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from "react-native";
import { launchCamera, launchImageLibrary } from "react-native-image-picker";
import TextRecognition from "@react-native-ml-kit/text-recognition";
import SQLite from "react-native-sqlite-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import Icon from "@react-native-vector-icons/material-icons";
import { useRoute, useFocusEffect } from "@react-navigation/native";

// DB and helpers (same as yours)
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
      );`
    );
  });
}

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

async function requestAllPermissions() {
  if (Platform.OS !== "android") return true;
  try {
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
  } catch (err) {
    console.error("Permission error:", err);
    Alert.alert("Error", "Unable to request permissions.");
    return false;
  }
}

function parseAadhaarText(fullText) {
  // unchanged: keep your parsing implementation
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

  const aadhaarMatch = cleanText.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
  if (aadhaarMatch) result.aadhaar_number = aadhaarMatch[0].replace(/\s/g, "");

  const dobLine = lines.find((l) => /DOB|Date of Birth/i.test(l));
  if (dobLine) {
    const dobMatch = dobLine.match(/\d{2}[\/-]\d{2}[\/-]\d{4}/);
    const yearMatch = dobLine.match(/\b\d{4}\b/);
    if (dobMatch) result.dob = dobMatch[0];
    else if (yearMatch) result.dob = yearMatch[0];
  }

  if (/male/i.test(cleanText)) result.gender = "Male";
  else if (/female/i.test(cleanText)) result.gender = "Female";

  const mobileMatch = cleanText.match(/\b[6-9]\d{9}\b/);
  if (mobileMatch) result.mobile = mobileMatch[0];

  for (let line of lines) {
    if (
      /^[A-Za-z ]+$/.test(line) &&
      !/DOB|Year|Gender|Address|Father|Mother|Wife|Husband/i.test(line)
    ) {
      result.name = line.trim();
      break;
    }
  }

  const addressIndex = lines.findIndex((l) => /address/i.test(l));
  if (addressIndex !== -1) {
    const addressLines = lines
      .slice(addressIndex + 1, addressIndex + 6)
      .filter((line) => !/(www\.|http|help|mailto)/i.test(line));
    result.address = addressLines.join(", ").trim();
  }

  return result;
}

export default function AadharScanner() {
  const route = useRoute();
  const scrollRef = useRef(null);

  const [form, setForm] = useState({
    id:0,
    aadhaar_number: "",
    name: "",
    dob: "",
    address: "",
    gender: "",
    mobile: "",
    scanned_at: "",
  });
  const [records, setRecords] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [updateModeOn, setUpdateModeOn] = useState(false);

  // init once
  useEffect(() => {
    initDatabase();
    requestAllPermissions();
    fetchRecords();
  }, []);

  useEffect(() => {
  if (route.params?.record) {
    const recordToEdit = route.params.record;
console.log("TimeStamp ", getIndianTimestamp());
    setUpdateModeOn(true);
    setForm({
      id:recordToEdit.id || 0,
      aadhaar_number: recordToEdit.aadhaar_number || "",
      name: recordToEdit.name || "",
      dob: recordToEdit.dob || "",
      address: recordToEdit.address || "",
      gender: recordToEdit.gender || "",
      mobile: recordToEdit.mobile || "",
      scanned_at: recordToEdit.scanned_at || getIndianTimestamp(),
    });

    ToastAndroid.show("✏️ Editing Aadhaar Record", ToastAndroid.SHORT);
  }
}, [route.params?.record, route.params?.refreshKey]);

  // OCR & image handlers (unchanged)
  async function processImage(uri, type) {
    try {
      const ocrResult = await TextRecognition.recognize(uri);
      const extractedText = ocrResult?.text?.trim();
      if (!extractedText || extractedText.length < 30) {
        Alert.alert("Image not clear", "No readable text found.");
        return false;
      }
      const parsed = parseAadhaarText(extractedText);
      if (type === "front") setForm((prev) => ({ ...prev, ...parsed }));
      else if (type === "back")
        setForm((prev) => ({ ...prev, address: parsed.address }));
      return true;
    } catch (err) {
      console.error("OCR error:", err);
      Alert.alert("Error", "Failed to extract Aadhaar details.");
      return false;
    }
  }

  async function captureAadhaar() {
    const allowed = await requestAllPermissions();
    if (!allowed) return;
    const frontRes = await launchCamera({ mediaType: "photo", quality: 0.8 });
    if (frontRes.didCancel || !frontRes.assets?.[0]?.uri) return;
    const frontOk = await processImage(frontRes.assets[0].uri, "front");
    if (!frontOk) return;
    const backRes = await launchCamera({ mediaType: "photo", quality: 0.8 });
    if (backRes.didCancel || !backRes.assets?.[0]?.uri) return;
    const backOk = await processImage(backRes.assets[0].uri, "back");
    if (!backOk) return;
    setForm((prev) => ({ ...prev, scanned_at: getIndianTimestamp() }));
    ToastAndroid.show("✅ Aadhaar captured successfully!", ToastAndroid.SHORT);
  }

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
    setForm((prev) => ({ ...prev, scanned_at: getIndianTimestamp() }));
    ToastAndroid.show("✅ Aadhaar images processed!", ToastAndroid.SHORT);
  }

  // Save/update (unchanged)
  function saveToDB() {
    if (!validateInputs()) {
      Alert.alert("Validation Error", "Please fill all fields properly.");
      return;
    }
    const { name, aadhaar_number, dob, address, gender, mobile, scanned_at, id } = form;

    console.log("Printing Scanned At", )
    db.transaction((tx) => {
      if (updateModeOn) {
        tx.executeSql(
          `UPDATE AadharData 
           SET name=?, dob=?, address=?, gender=?, mobile=?, scanned_at=?,aadhaar_number=? 
           WHERE id=?`,
          [name, dob, address, gender, mobile, getIndianTimestamp(), aadhaar_number,id],
          () => {
            ToastAndroid.show("✅ Record updated successfully!", ToastAndroid.SHORT);
            fetchRecords();
            setUpdateModeOn(false);
            clearAllFields();
          },
          (tx, err) => console.error("DB update error:", err)
        );
      } else {
        tx.executeSql(
          `INSERT INTO AadharData 
           (name, aadhaar_number, dob, address, gender, mobile, scanned_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [name, aadhaar_number, dob, address, gender, mobile, getIndianTimestamp()],
          () => {
            ToastAndroid.show("✅ Data saved successfully!", ToastAndroid.SHORT);
            fetchRecords();
            clearAllFields();
          },
          (tx, err) => {
            console.error("DB insert error:", err);
            Alert.alert("Database Error", "Failed to save Aadhaar data.");
          }
        );
      }
    });
  }

  function validateInputs() {
    const { name, aadhaar_number, mobile, address, dob } = form;
    if (!name.trim() || !/^[A-Za-z ]+$/.test(name)) return false;
    if (!aadhaar_number.match(/^\d{12}$/)) return false;
    if (!mobile.match(/^\d{10}$/)) return false;
    if (!address.trim()) return false;
    if (dob && new Date(dob) > new Date()) return false;
    return true;
  }

  function clearAllFields() {
    setForm({
      aadhaar_number: "",
      name: "",
      dob: "",
      address: "",
      gender: "",
      mobile: "",
      scanned_at: "",
    });
  }

  function fetchRecords() {
    db.transaction((tx) => {
      tx.executeSql(`SELECT * FROM AadharData ORDER BY id DESC`, [], (tx, results) => {
        const temp = [];
        for (let i = 0; i < results.rows.length; i++) temp.push(results.rows.item(i));
        setRecords(temp);
      });
    });
  }

  // UI (same as yours)
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>
        <Text style={styles.heading}>
          {updateModeOn ? "✏️ Edit Aadhaar Record" : "🪪 Aadhaar Scanner"}
        </Text>

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
            {f.key === "dob" ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.input,
                    {
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    },
                  ]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text>{form.dob || "Select Date"}</Text>
                  <Icon name="calendar-today" size={20} color="#555" />
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={form.dob ? new Date(form.dob) : new Date()}
                    mode="date"
                    maximumDate={new Date()}
                    display="spinner"
                    onChange={(event, selectedDate) => {
                      setShowDatePicker(false);
                      if (selectedDate)
                        setForm({
                          ...form,
                          dob: selectedDate.toISOString().split("T")[0],
                        });
                    }}
                  />
                )}
              </>
            ) : (
              <TextInput
                style={styles.input}
                value={form[f.key]}
                keyboardType={
                  f.key === "mobile" || f.key === "aadhaar_number"
                    ? "numeric"
                    : "default"
                }
                maxLength={
                  f.key === "mobile"
                    ? 10
                    : f.key === "aadhaar_number"
                    ? 12
                    : undefined
                }
                onChangeText={(t) => {
                  if (f.key === "name") t = t.replace(/[^A-Za-z ]/g, "");
                  if (f.key === "aadhaar_number") t = t.replace(/\D/g, "");
                  setForm({ ...form, [f.key]: t });
                }}
                placeholder={`Enter ${f.label}`}
              />
            )}
          </View>
        ))}

        {form.scanned_at ? (
          <Text style={{ marginTop: 8, color: "gray" }}>
            🕒 Scanned At: {form.scanned_at}
          </Text>
        ) : null}

        <View style={styles.buttonGroup}>
          {!updateModeOn && (
            <>
              <Button title="📷 Capture Aadhaar" onPress={captureAadhaar} />
              <View style={{ height: 10 }} />
              <Button title="📁 Pick Aadhaar Images" onPress={pickAadhaarImages} />
              <View style={{ height: 10 }} />
            </>
          )}

          <TouchableOpacity
            onPress={saveToDB}
            disabled={!validateInputs()}
            style={[
              styles.saveButton,
              { backgroundColor: validateInputs() ? "green" : "#ccc" },
            ]}
          >
            <Text style={styles.saveButtonText}>
              {updateModeOn ? "💾 Update Record" : "💾 Save Data"}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 10 }} />
          <Button title="🧹 Clear All Fields" onPress={clearAllFields} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f9f9f9",
    paddingTop: Platform.OS === "android" ? 30 : 0,
  },
  container: { padding: 20, paddingBottom: 80 },
  heading: { fontWeight: "bold", fontSize: 18, marginBottom: 10 },
  fieldGroup: { marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#999",
    borderRadius: 8,
    padding: 12,
    marginTop: 5,
    backgroundColor: "#fff",
  },
  buttonGroup: { marginTop: 20, marginBottom: 20 },
  saveButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  saveButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});