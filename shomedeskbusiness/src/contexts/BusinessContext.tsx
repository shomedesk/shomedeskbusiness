import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { db, auth } from '@/src/lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, getDocs, Unsubscribe } from 'firebase/firestore';
import { Business, Branch, UserProfile, BankAccount, Service } from '@/src/types';
import { useAuthState } from 'react-firebase-hooks/auth';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';

interface BusinessContextType {
  businesses: Business[];
  branches: Branch[];
  services: Service[];
  bankAccounts: BankAccount[];
  selectedBusiness: Business | null;
  isAllBusinessesSelected: boolean;
  selectedBranch: Branch | null; // null means "All Branches"
  selectedService: Service | null;
  userProfile: UserProfile | null;
  isBranchAuthenticated: boolean;
  authenticateBranch: (pin: string) => boolean;
  setSelectedBusiness: (business: Business | null) => void;
  setSelectedBranch: (branch: Branch | null) => void;
  setSelectedService: (service: Service | null) => void;
  setAllBusinessesSelected: (selected: boolean) => void;
  loading: boolean;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [user] = useAuthState(auth);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBusiness, _setSelectedBusiness] = useState<Business | null>(null);
  const [isAllBusinessesSelected, setIsAllBusinessesSelected] = useState(false);
  const [selectedBranch, _setSelectedBranch] = useState<Branch | null>(null);
  const [selectedService, _setSelectedService] = useState<Service | null>(null);

  const setAllBusinessesSelected = (selected: boolean) => {
    setIsAllBusinessesSelected(selected);
    if (selected) {
      _setSelectedBusiness(null);
      _setSelectedBranch(null);
      _setSelectedService(null);
    }
  };

  const setSelectedBusiness = async (business: Business | null) => {
    _setSelectedBusiness(business);
    setIsAllBusinessesSelected(false);
    _setSelectedBranch(null);
    _setSelectedService(null);
    if (user && business && userProfile?.role !== 'branch_manager') {
      try {
        await updateDoc(doc(db, 'users', user.uid), { businessId: business.id });
      } catch (error) {
        console.error('Failed to update user profile businessId:', error);
      }
    }
  };

  const setSelectedBranch = async (branch: Branch | null) => {
    _setSelectedBranch(branch);
    if (branch) _setSelectedService(null);
    if (user && branch && userProfile?.role !== 'branch_manager') {
      try {
        await updateDoc(doc(db, 'users', user.uid), { branchId: branch.id });
      } catch (error) {
        console.error('Failed to update user profile branchId:', error);
      }
    } else if (user && !branch && userProfile?.role !== 'branch_manager') {
      try {
        await updateDoc(doc(db, 'users', user.uid), { branchId: null });
      } catch (error) {
        console.error('Failed to clear user profile branchId:', error);
      }
    }
  };
  const setSelectedService = (service: Service | null) => {
    _setSelectedService(service);
    if (service) _setSelectedBranch(null);
  };

  const [loading, setLoading] = useState(true);
  const [isBranchAuthenticated, setIsBranchAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  
  const nestedUnsubRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    if (!user) {
      setBusinesses([]);
      setBranches([]);
      setServices([]);
      setBankAccounts([]);
      _setSelectedBusiness(null);
      _setSelectedBranch(null);
      _setSelectedService(null);
      setUserProfile(null);
      setLoading(false);
      if (nestedUnsubRef.current) {
        nestedUnsubRef.current();
        nestedUnsubRef.current = null;
      }
      return;
    }

    setLoading(true);
    const unsubProfile = onSnapshot(doc(db, 'users', user.uid), async (docSnap) => {
      if (docSnap.exists()) {
        const profile = docSnap.data() as UserProfile;
        
        // Auto-fix: if admin and ownedBusinessIds is missing
        if (profile.role === 'admin' && !profile.ownedBusinessIds) {
          try {
            const bQuery = query(collection(db, 'businesses'), where('ownerId', '==', user.uid));
            const bSnap = await getDocs(bQuery);
            const ids = bSnap.docs.map(d => d.id);
            await updateDoc(doc(db, 'users', user.uid), { ownedBusinessIds: ids });
            profile.ownedBusinessIds = ids;
          } catch (err) {
            console.error('Failed to auto-fix ownedBusinessIds:', err);
          }
        }
        
        setUserProfile(profile);

        // Cleanup previous nested subscription
        if (nestedUnsubRef.current) {
          nestedUnsubRef.current();
          nestedUnsubRef.current = null;
        }

        if (profile.role === 'branch_manager') {
          // Branch Manager: Fetch only the assigned business and branch
          const bRef = doc(db, 'businesses', profile.businessId);
          const brRef = doc(db, 'branches', profile.branchId);

          // Use onSnapshot for business to handle real-time updates
          const unsubB = onSnapshot(bRef, (bSnap) => {
            if (bSnap.exists()) {
              const bData = { id: bSnap.id, ...bSnap.data() } as Business;
              setBusinesses([bData]);
              _setSelectedBusiness(bData);
            }
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, `businesses/${profile.businessId}`);
          });

          // Use onSnapshot for branch to handle real-time updates
          const unsubBr = onSnapshot(brRef, (brSnap) => {
            if (brSnap.exists()) {
              const brData = { id: brSnap.id, ...brSnap.data() } as Branch;
              setBranches([brData]);
              _setSelectedBranch(brData);
            }
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, `branches/${profile.branchId}`);
          });

          nestedUnsubRef.current = () => {
            unsubB();
            unsubBr();
          };
          setLoading(false);
        } else {
          // Admin or Accounts Manager: Fetch all businesses owned by this user
          if (profile.role === 'admin') {
            const bQuery = query(collection(db, 'businesses'), where('ownerId', '==', user.uid));
            nestedUnsubRef.current = onSnapshot(bQuery, (snapshot) => {
              const bList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Business));
              setBusinesses(bList);
              if (bList.length > 0 && !selectedBusiness) {
                _setSelectedBusiness(bList[0]);
              }
              setLoading(false);
            }, (error) => {
              handleFirestoreError(error, OperationType.LIST, 'businesses');
            });
          } else {
            // Manager assigned to one business
            const bRef = doc(db, 'businesses', profile.businessId);
            nestedUnsubRef.current = onSnapshot(bRef, (docSnap) => {
              if (docSnap.exists()) {
                const bData = { id: docSnap.id, ...docSnap.data() } as Business;
                setBusinesses([bData]);
                if (!selectedBusiness) {
                  _setSelectedBusiness(bData);
                }
              }
              setLoading(false);
            }, (error) => {
              handleFirestoreError(error, OperationType.GET, `businesses/${profile.businessId}`);
            });
          }
        }
      } else {
        setLoading(false);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      setLoading(false);
    });

    return () => {
      unsubProfile();
      if (nestedUnsubRef.current) {
        nestedUnsubRef.current();
        nestedUnsubRef.current = null;
      }
    };
  }, [user]);

  useEffect(() => {
    if (!selectedBusiness && !isAllBusinessesSelected) {
      setBranches([]);
      setBankAccounts([]);
      _setSelectedBranch(null);
      return;
    }

    if (isAllBusinessesSelected) {
      // Fetch all branches for all businesses
      const brQuery = query(collection(db, 'branches'), where('businessId', 'in', businesses.map(b => b.id).slice(0, 10))); // Firestore 'in' limit is 10
      const unsubBr = onSnapshot(brQuery, (snapshot) => {
        const brList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Branch));
        setBranches(brList);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'branches');
      });

      // Fetch all services for all businesses
      const sQuery = query(collection(db, 'services'), where('businessId', 'in', businesses.map(b => b.id).slice(0, 10)));
      const unsubS = onSnapshot(sQuery, (snapshot) => {
        const sList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Service));
        setServices(sList);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'services');
      });

      // Fetch all bank accounts for all businesses + global accounts
      const baQuery = query(
        collection(db, 'bankAccounts'), 
        where('ownerId', '==', user?.uid)
      );
      const unsubBa = onSnapshot(baQuery, (snapshot) => {
        const baList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BankAccount));
        // Filter for either business accounts or global accounts
        const filtered = baList.filter(ba => 
          ba.businessId === 'global' || businesses.some(b => b.id === ba.businessId)
        );
        setBankAccounts(filtered);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'bankAccounts');
      });

      return () => {
        unsubBr();
        unsubS();
        unsubBa();
      };
    } else {
      // Fetch branches for selected business
      const brQuery = query(collection(db, 'branches'), where('businessId', '==', selectedBusiness!.id));
      const unsubBr = onSnapshot(brQuery, (snapshot) => {
        const brList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Branch));
        setBranches(brList);
        if (userProfile?.role === 'branch_manager' && brList.length > 0 && !selectedBranch) {
          _setSelectedBranch(brList[0]);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `branches?businessId=${selectedBusiness!.id}`);
      });

      // Fetch services for selected business
      const sQuery = query(collection(db, 'services'), where('businessId', '==', selectedBusiness!.id));
      const unsubS = onSnapshot(sQuery, (snapshot) => {
        const sList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Service));
        setServices(sList);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `services?businessId=${selectedBusiness!.id}`);
      });

      // Fetch bank accounts for selected business + global accounts
      const baQuery = query(
        collection(db, 'bankAccounts'), 
        where('ownerId', '==', user?.uid)
      );
      const unsubBa = onSnapshot(baQuery, (snapshot) => {
        const baList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BankAccount));
        // Filter for either the selected business or global accounts
        const filtered = baList.filter(ba => 
          ba.businessId === 'global' || ba.businessId === selectedBusiness!.id
        );
        setBankAccounts(filtered);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `bankAccounts?businessId=${selectedBusiness!.id}`);
      });

      return () => {
        unsubBr();
        unsubS();
        unsubBa();
      };
    }
  }, [selectedBusiness, isAllBusinessesSelected, businesses, userProfile]);

  // Reset branch authentication when branch changes
  useEffect(() => {
    setIsBranchAuthenticated(false);
  }, [selectedBranch]);

  const authenticateBranch = (pin: string) => {
    if (selectedBranch && selectedBranch.managerPin === pin) {
      setIsBranchAuthenticated(true);
      return true;
    }
    return false;
  };

  return (
    <BusinessContext.Provider value={{
      businesses,
      branches,
      services,
      bankAccounts,
      selectedBusiness,
      isAllBusinessesSelected,
      selectedBranch,
      selectedService,
      userProfile,
      setSelectedBusiness,
      setSelectedBranch,
      setSelectedService,
      setAllBusinessesSelected,
      isBranchAuthenticated,
      authenticateBranch,
      loading
    }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (context === undefined) {
    throw new Error('useBusiness must be used within a BusinessProvider');
  }
  return context;
}
