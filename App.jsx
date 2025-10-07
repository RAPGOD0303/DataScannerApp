import React, { useState, useEffect } from "react";
import {
  View,
  Button,
  Text,
  Alert,
  PermissionsAndroid,
  Platform,
  Linking,
  BackHandler,
} from "react-native";
import { launchCamera, launchImageLibrary } from "react-native-image-picker";
import RNFS from "react-native-fs";
import TextRecognition from "@react-native-ml-kit/text-recognition";
 
/* ---------------------- PATHS ---------------------- */
const CSV_FILENAME = "aadhar_scans.csv";
const CSV_PATH =
  Platform.OS === "android"
    ? `${RNFS.ExternalDirectoryPath}/${CSV_FILENAME}`
    : `${RNFS.DocumentDirectoryPath}/${CSV_FILENAME}`;
 
/* ---------------------- PERMISSIONS ---------------------- */
async function requestCameraPermission() {
  if (Platform.OS !== "android") return true;
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
    {
      title: "Camera Permission",
      message: "App needs access to your camera to scan Aadhaar cards.",
      buttonPositive: "OK",
    }
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}
 
async function requestStoragePermission() {
  if (Platform.OS !== "android") return true;
 
  if (Platform.Version >= 33) {
    const r = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
      {
        title: "Storage Permission",
        message: "App needs permission to read images from gallery.",
        buttonPositive: "OK",
      }
    );
    return r === PermissionsAndroid.RESULTS.GRANTED;
  } else if (Platform.Version <= 29) {
    const read = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      {
        title: "Storage Permission",
        message: "App needs permission to read images.",
        buttonPositive: "OK",
      }
    );
    const write = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      {
        title: "Storage Permission",
        message: "App needs permission to write CSV.",
        buttonPositive: "OK",
      }
    );
    return read === PermissionsAndroid.RESULTS.GRANTED && write === PermissionsAndroid.RESULTS.GRANTED;
  } else {
    const read = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      {
        title: "Storage Permission",
        message: "App needs permission to read images.",
        buttonPositive: "OK",
      }
    );
    return read === PermissionsAndroid.RESULTS.GRANTED;
  }
}
 
async function requestAllPermissions() {
  const camera = await requestCameraPermission();
  const storage = await requestStoragePermission();
 
  if (!camera || !storage) {
    Alert.alert(
      "Permissions Required",
      "Camera and Storage permissions are required. Open app settings to grant them.",
      [
        { text: "Open Settings", onPress: () => Linking.openSettings() },
        { text: "Exit App", onPress: () => BackHandler.exitApp(), style: "destructive" },
      ],
      { cancelable: false }
    );
    return false;
  }
  return true;
}
 
/* ---------------------- HELPERS ---------------------- */
function maskAadhaar(aadhaar) {
  const onlyDigits = (aadhaar || "").replace(/\D/g, "");
  if (onlyDigits.length === 12) return "xxxx-xxxx-" + onlyDigits.slice(-4);
  return aadhaar;
}
 
function parseAadhaarText(fullText) {
  const result = { aadhaarRaw: null, aadhaarMasked: null, name: null, dob: null, rawText: fullText };
  if (!fullText) return result;
 
  const aadhaarMatch = fullText.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
  if (aadhaarMatch) {
    const aad = aadhaarMatch[0].replace(/\s/g, "");
    result.aadhaarRaw = aad;
    result.aadhaarMasked = maskAadhaar(aad);
  }
 
  const dobMatch = fullText.match(/\b(?:\d{2}[\/-]\d{2}[\/-]\d{4})\b/);
  if (dobMatch) result.dob = dobMatch[0];
 
  const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const forbidden = /DOB|DO B|YEAR|UID|GOVT|INDIA|FATHER|MOTHER|SEX|Male|Female|Name/i;
 
  for (let line of lines) {
    if (forbidden.test(line)) continue;
    if (/[,0-9]/.test(line) && line.length > 40) continue;
    if (line.split(" ").length >= 2 && /[A-Za-z]/.test(line)) {
      result.name = line;
      break;
    }
  }
 
  if (!result.name && aadhaarMatch) {
    const aadIndex = lines.findIndex((l) => l.includes(aadhaarMatch[0].slice(0, 4)));
    if (aadIndex > 0) {
      const candidate = lines[aadIndex - 1];
      if (candidate && candidate.length < 60) result.name = candidate;
    }
  }
  return result;
}
 
/* ---------------------- CSV LOGIC ---------------------- */
async function appendToCSV(rowObj) {
  const header = "scanned_at_iso,name,aadhaar_masked,dob,raw_text\n";
  const line =
    `"${rowObj.dateISO}","${(rowObj.name || "").replace(/"/g, '""')}","${(rowObj.aadhaarMasked || "")}",` +
    `"${(rowObj.dob || "")}","${(rowObj.rawText || "").replace(/"/g, '""')}"\n`;
 
  try {
    const exists = await RNFS.exists(CSV_PATH);
    if (!exists) {
      await RNFS.writeFile(CSV_PATH, header + line, "utf8");
    } else {
      await RNFS.appendFile(CSV_PATH, line, "utf8");
    }
    console.log("CSV saved at:", CSV_PATH);
    return CSV_PATH;
  } catch (err) {
    console.error("appendToCSV error:", err);
    throw err;
  }
}
 
/* ---------------------- MAIN COMPONENT ---------------------- */
export default function AadharScanner() {
  const [lastScan, setLastScan] = useState(null);
 
  useEffect(() => {
    requestAllPermissions();
  }, []);
 
  async function processImage(uri) {
    try {
      const ocrResult = await TextRecognition.recognize(uri);
      const extractedText = ocrResult?.text || "";
      const parsed = parseAadhaarText(extractedText);
 
      const row = {
        dateISO: new Date().toISOString(),
        name: parsed.name || "",
        aadhaarMasked: parsed.aadhaarMasked || "",
        dob: parsed.dob || "",
        rawText: parsed.rawText || extractedText || "",
      };
 
      const csvPath = await appendToCSV(row);
      setLastScan({ parsed, csvPath });
      Alert.alert("Saved", `Parsed and saved to CSV at:\n${csvPath}`);
    } catch (err) {
      console.error("processImage error:", err);
      Alert.alert("Error", err.message || "Unknown error processing image");
    }
  }
 
  async function handleCapture() {
    const allowed = await requestAllPermissions();
    if (!allowed) return;
 
    const res = await launchCamera({ mediaType: "photo", quality: 0.8 });
    if (res.didCancel) return;
    if (res.errorCode) return Alert.alert("Camera Error", res.errorMessage || "Unknown");
    const asset = res.assets?.[0];
    if (asset?.uri) await processImage(asset.uri);
  }
 
  async function handlePickImage() {
    const allowed = await requestAllPermissions();
    if (!allowed) return;
 
    const res = await launchImageLibrary({ mediaType: "photo", quality: 0.8 });
    if (res.didCancel) return;
    if (res.errorCode) return Alert.alert("Image Picker Error", res.errorMessage || "Unknown");
    const asset = res.assets?.[0];
    if (asset?.uri) await processImage(asset.uri);
  }
 
  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
      <Button title="📷 Capture Aadhaar (Camera)" onPress={handleCapture} />
      <View style={{ height: 10 }} />
      <Button title="🖼 Pick Aadhaar Image" onPress={handlePickImage} />
      <View style={{ height: 20 }} />
      {lastScan ? (
        <View>
          <Text style={{ fontWeight: "bold" }}>Last scan parsed:</Text>
          <Text>{JSON.stringify(lastScan.parsed, null, 2)}</Text>
          <Text>CSV Path: {lastScan.csvPath}</Text>
        </View>
      ) : (
        <Text style={{ marginTop: 20 }}>No scans yet</Text>
      )}
    </View>
  );
}