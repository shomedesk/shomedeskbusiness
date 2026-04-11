import React, { useState } from 'react';
import { db, auth } from '@/src/lib/firebase';
import { GoogleAuthProvider, signInWithPopup, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc, limit } from 'firebase/firestore';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { LogIn, User, Key, Building2 } from 'lucide-react';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';

export default function Auth() {
  const [isManagerLogin, setIsManagerLogin] = useState(false);
  const [managerId, setManagerId] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user profile exists by UID
      const userRef = doc(db, 'users', user.uid);
      let userSnap;
      try {
        userSnap = await getDoc(userRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      }

      if (!userSnap.exists()) {
        // Check if a placeholder profile exists by email
        const q = query(collection(db, 'users'), where('email', '==', user.email));
        let emailSnap;
        try {
          emailSnap = await getDocs(q);
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, 'users');
        }

        if (!emailSnap.empty) {
          const placeholderDoc = emailSnap.docs[0];
          const placeholderData = placeholderDoc.data();
          
          // Migrate placeholder to real UID doc
          await setDoc(userRef, {
            ...placeholderData,
            uid: user.uid,
            displayName: user.displayName || placeholderData.displayName,
            isPlaceholder: false,
            ownedBusinessIds: placeholderData.ownedBusinessIds || []
          });
          
          // Delete placeholder if it was a different doc
          if (placeholderDoc.id !== user.uid) {
            await deleteDoc(doc(db, 'users', placeholderDoc.id));
          }
        } else if (user.email === 'shomedesk@gmail.com') {
          // Create default business and profile for the main admin
          const businessRef = await addDoc(collection(db, 'businesses'), {
            name: `${user.displayName || 'My'}'s Business`,
            ownerId: user.uid,
            currency: 'INR',
            mobileNumber: '',
            createdAt: serverTimestamp()
          });

          const branchRef = await addDoc(collection(db, 'branches'), {
            businessId: businessRef.id,
            name: 'Main Branch',
            location: 'Default Location',
            managerName: user.displayName || 'Manager',
            managerId: 'admin',
            managerPin: '123456',
            mobileNumber: '',
            createdAt: serverTimestamp()
          });

          await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            role: 'admin',
            businessId: businessRef.id,
            branchId: branchRef.id,
            ownedBusinessIds: [businessRef.id]
          });
        } else {
          // Reject unauthorized user
          await auth.signOut();
          toast.error('You are not authorized to access this portal. Please contact the administrator.');
          return;
        }
      }

      toast.success('Logged in successfully');
    } catch (error) {
      console.error(error);
      toast.error('Login failed');
    }
  };

  const handleManagerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(false); // Reset loading if it was set before
    setLoading(true);
    try {
      // First, try to find the branch WITHOUT auth (rules must allow this specific query)
      const loginQuery = query(
        collection(db, 'branches'), 
        where('managerId', '==', managerId),
        where('managerPin', '==', managerPin),
        limit(1)
      );
      
      let querySnapshot;
      try {
        querySnapshot = await getDocs(loginQuery);
      } catch (err: any) {
        // If unauthenticated query fails, try signing in anonymously first
        try {
          await signInAnonymously(auth);
          querySnapshot = await getDocs(loginQuery);
        } catch (authErr: any) {
          if (authErr.code === 'auth/admin-restricted-operation' || authErr.code === 'auth/operation-not-allowed') {
            throw new Error('MANAGER_LOGIN_DISABLED');
          }
          handleFirestoreError(authErr, OperationType.LIST, 'branches');
        }
      }

      if (querySnapshot.empty) {
        await auth.signOut();
        toast.error('Invalid UserID or PIN');
        return;
      }

      const branchDoc = querySnapshot.docs[0];
      const branchData = branchDoc.data();

      // Ensure we are signed in (anonymously) to create the profile
      let currentUser = auth.currentUser;
      if (!currentUser) {
        const authResult = await signInAnonymously(auth);
        currentUser = authResult.user;
      }

      // Create/Update temporary profile for this manager session
      await setDoc(doc(db, 'users', currentUser.uid), {
        uid: currentUser.uid,
        email: `manager_${managerId}@shomedesk.com`,
        displayName: branchData.managerName,
        role: 'branch_manager',
        businessId: branchData.businessId,
        branchId: branchDoc.id
      });

      toast.success(`Welcome, ${branchData.managerName}`);
      navigate('/');
    } catch (error: any) {
      console.error('Manager login error:', error);
      if (error.message === 'MANAGER_LOGIN_DISABLED' || error.code === 'auth/admin-restricted-operation' || error.code === 'auth/operation-not-allowed') {
        toast.error(
          <div className="space-y-2">
            <p className="font-bold">Manager login is currently disabled.</p>
            <p className="text-xs">Please enable "Anonymous Authentication" in the Firebase Console:</p>
            <a 
              href="https://console.firebase.google.com/project/mytobo/authentication/providers" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-400 underline text-xs block mt-1"
            >
              Open Firebase Console
            </a>
          </div>,
          { duration: 10000 }
        );
      } else {
        toast.error('Manager login failed. Please check your credentials and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-6 text-slate-50">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tighter text-blue-500">
            SHOMEDESK
          </h1>
          <p className="text-slate-400 font-medium uppercase tracking-widest text-sm">
            SaaS Business Management
          </p>
        </div>

        <div className="bg-[#1E293B] p-8 rounded-3xl border border-slate-800 shadow-2xl space-y-6">
          <div className="flex bg-slate-900 p-1 rounded-2xl">
            <button 
              onClick={() => setIsManagerLogin(false)}
              className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${!isManagerLogin ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Admin Login
            </button>
            <button 
              onClick={() => setIsManagerLogin(true)}
              className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${isManagerLogin ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Manager Login
            </button>
          </div>

          {!isManagerLogin ? (
            <div className="space-y-6">
              <p className="text-slate-300 text-lg leading-relaxed">
                Automate your business operations with our professional SaaS platform.
              </p>
              
              <button
                onClick={handleGoogleLogin}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-blue-900/20"
              >
                <LogIn size={22} />
                Sign in with Google
              </button>
            </div>
          ) : (
            <form onSubmit={handleManagerLogin} className="space-y-4 text-left">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Manager UserID</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    type="text"
                    required
                    value={managerId}
                    onChange={(e) => setManagerId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 pl-12 text-sm outline-none focus:border-blue-500"
                    placeholder="Enter your UserID"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Manager PIN</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    type="password"
                    required
                    maxLength={6}
                    value={managerPin}
                    onChange={(e) => setManagerPin(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 pl-12 text-sm outline-none focus:border-blue-500"
                    placeholder="Enter 6-digit PIN"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-blue-900/20"
              >
                <Building2 size={20} />
                Enter Manager Portal
              </button>
            </form>
          )}
        </div>

        <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest">
          Enterprise Grade Security
        </p>
      </div>
    </div>
  );
}
