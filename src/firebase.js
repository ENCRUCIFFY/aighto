import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCTW0z1aLj41sAeq6quXAY7Y2Q9a6R4gT4",
  authDomain: "aighto.firebaseapp.com",
  projectId: "aighto",
  storageBucket: "aighto.firebasestorage.app",
  messagingSenderId: "498824711546",
  appId: "1:498824711546:web:6f1ee188da81aa378e5ac3",
  measurementId: "G-5ZY173C6H5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
